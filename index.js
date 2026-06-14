require('dotenv').config();
const { Client, GatewayIntentBits, Collection, PermissionFlagsBits, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, AttachmentBuilder } = require('discord.js');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const { getRoles, getTier } = require('./handlers/permissions');
const { executeCommand } = require('./handlers/queueHandler');
const { isLocked } = require('./handlers/lockdown');
const { isEnabled } = require('./handlers/systemToggle');
const { setSessionStatus, buildSettingUpEmbed } = require('./handlers/ssu');
const { handlePrefixCommand } = require('./handlers/prefixHandler');
const { fetchAllLogsForUser, getWeeklyShiftData, getAllActiveShifts, setTimeOverride } = require('./handlers/sheets');
const { buildPunishPage } = require('./commands/punishlogs');
const { buildWeeklyTotals, buildQuotaEmbed } = require('./commands/quotacheck');
const { getISOWeek, parseDurationInput, formatDuration, scheduleAllReminders } = require('./handlers/shiftAction');
const { autoWarn } = require('./handlers/modAction');
const { getProtected, incrementPinger, resetPinger } = require('./handlers/pingWarn');
const { getHost } = require('./handlers/session');
const config = require('./config');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Load all command files from /commands
client.commands = new Collection();
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

client.once('ready', async () => {
  console.log(`[47ModBot] Online as ${client.user.tag}`);
  console.log(`[47ModBot] In ${client.guilds.cache.size} server(s)`);
  await scheduleAllReminders(client);

  // ── Dashboard command queue ──────────────────────────────────────────────
  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    setInterval(async () => {
      try {
        const { data } = await sb.from('bot_commands').select('*').eq('status','pending').limit(5);
        for (const row of (data ?? [])) {
          await sb.from('bot_commands').update({ status:'processing' }).eq('id', row.id);
          try {
            const result = await executeCommand(row.command, row.args, row.requested_by, client);
            await sb.from('bot_commands').update({ status:'done', result, completed_at: new Date().toISOString() }).eq('id', row.id);
          } catch (err) {
            console.error(`[Queue] Error executing ${row.command}:`, err.message);
            await sb.from('bot_commands').update({ status:'error', result: err.message }).eq('id', row.id);
          }
        }
      } catch (err) {
        console.error('[Queue] Poll error:', err.message);
      }
    }, 3000);
    console.log('[47ModBot] Dashboard queue polling started.');
  } else {
    console.warn('[47ModBot] SUPABASE_URL/SUPABASE_KEY not set — dashboard queue disabled.');
  }
});

// ─── Auto quota check — every Sunday 6:00 PM Eastern ────────────────────────
cron.schedule('0 18 * * 0', async () => {
  try {
    const { week, year } = getISOWeek();
    const totals = await buildWeeklyTotals(week, year);
    const embed = buildQuotaEmbed(totals, week, year)
      .setTitle(`📊 Weekly Quota Check — Week ${week}`)
      .setFooter({ text: `Auto-generated • Week ${week} of ${year}` });

    const channel = await client.channels.fetch(config.quotaCheckChannelId);
    await channel.send({ embeds: [embed] });
    console.log(`[AutoQuotaCheck] Posted week ${week} quota check.`);
  } catch (err) {
    console.error('[AutoQuotaCheck] Error:', err.message);
  }
}, { timezone: 'America/New_York' });

// ─── Appeals helpers ─────────────────────────────────────────────────────────

function hasAppealsStaff(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return config.appealsStaffRoles.some(id => member.roles.cache.has(id));
}

async function generateAppealsTranscript(channel, closedBy) {
  let all = [];
  let lastId;
  while (true) {
    const opts = { limit: 100 };
    if (lastId) opts.before = lastId;
    const batch = await channel.messages.fetch(opts);
    if (!batch.size) break;
    all = all.concat(Array.from(batch.values()));
    lastId = batch.last().id;
    if (batch.size < 100) break;
  }
  all.reverse();
  const lines = all.map(m => {
    const t    = new Date(m.createdTimestamp).toUTCString();
    const atts = m.attachments.map(a => ` [attachment: ${a.url}]`).join('');
    return `[${t}] ${m.author.tag}: ${m.content}${atts}`;
  });
  return {
    text: `Transcript for #${channel.name}\nClosed by: ${closedBy}\nMessages: ${all.length}\n\n${lines.join('\n')}`,
    count: all.length,
  };
}

async function createAppealTicket(interaction, { category, prefix, title, fields }) {
  await interaction.deferReply({ ephemeral: true });
  const guild    = interaction.guild;
  const user     = interaction.user;
  const safeName = user.username.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20);
  const name     = `${prefix}-${safeName}`;

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: category,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ...config.appealsStaffRoles.map(roleId => ({
        id: roleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
      })),
    ],
    topic: `category:${category}|opener:${user.id}`,
  });

  const welcomeEmbed = new EmbedBuilder()
    .setTitle(`${title} — Opened`)
    .setDescription(`Welcome ${user}! Your appeal has been submitted.\n\nPlease be patient while a staff member reviews your case.`)
    .setColor(0x57F287)
    .setTimestamp();

  let detailsDesc = '';
  for (const [label, value] of fields) {
    detailsDesc += `**${label}:**\n${value || '—'}\n\n`;
  }
  const detailsEmbed = new EmbedBuilder()
    .setTitle('Appeal Details')
    .setDescription(detailsDesc.trim())
    .setColor(0x2B2D31)
    .setFooter({ text: 'Site 47 Appeals' });

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('appeals_close').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
  );

  await channel.send({
    content: `${user} | ${config.appealsStaffRoles.map(id => `<@&${id}>`).join(' ')}`,
    embeds: [welcomeEmbed],
    components: [closeRow],
    allowedMentions: { parse: [] },
  });
  await channel.send({ embeds: [detailsEmbed] });
  await interaction.editReply({ content: `✅ Your ticket has been created: ${channel}` });
}

// ─────────────────────────────────────────────────────────────────────────────

client.on('interactionCreate', async interaction => {

  // ── Appeals server — fully self-contained block ───────────────────────────
  if (interaction.guildId === config.appealsGuildId) {
    const isAppealsStaff = interaction.member ? hasAppealsStaff(interaction.member) : false;

    // Buttons
    if (interaction.isButton()) {
      if (interaction.customId === 'open_ingame') {
        const modal = new ModalBuilder().setCustomId('modal_ingame').setTitle('In-Game Appeal');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roblox_user').setLabel('Roblox Username').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('punishment_type').setLabel('Punishment Type (Kick / Ban / Other)').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason_given').setLabel('Reason You Were Given').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('explanation').setLabel('Why You Believe It Was Wrong').setStyle(TextInputStyle.Paragraph).setRequired(true)),
        );
        return interaction.showModal(modal);
      }

      if (interaction.customId === 'open_discord') {
        const modal = new ModalBuilder().setCustomId('modal_discord').setTitle('Discord Appeal');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('discord_user').setLabel('Your Discord Username').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('punishment_type').setLabel('Punishment Type (Warn / Mute / Kick / Ban)').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason_given').setLabel('Reason You Were Given').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('explanation').setLabel('Why You Believe It Was Wrong').setStyle(TextInputStyle.Paragraph).setRequired(true)),
        );
        return interaction.showModal(modal);
      }

      if (interaction.customId === 'open_staffreport') {
        const modal = new ModalBuilder().setCustomId('modal_staffreport').setTitle('Staff Report');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('staff_user').setLabel("Staff Member's Username").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('what_happened').setLabel('What Happened').setStyle(TextInputStyle.Paragraph).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('evidence').setLabel('Evidence (link or description)').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('notes').setLabel('Additional Notes').setStyle(TextInputStyle.Paragraph).setRequired(false)),
        );
        return interaction.showModal(modal);
      }

      if (interaction.customId === 'appeals_close') {
        if (!isAppealsStaff) return interaction.reply({ content: '❌ Only staff can close tickets.', ephemeral: true });
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('appeals_close_confirm').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
          new ButtonBuilder().setCustomId('appeals_close_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary).setEmoji('✖️'),
        );
        return interaction.reply({ content: 'Are you sure you want to close this ticket?', components: [confirmRow] });
      }

      if (interaction.customId === 'appeals_close_cancel') {
        return interaction.message.delete().catch(() => {});
      }

      if (interaction.customId === 'appeals_close_confirm') {
        if (!isAppealsStaff) return interaction.reply({ content: '❌ Only staff can close tickets.', ephemeral: true });
        await interaction.deferUpdate();
        const channel = interaction.channel;

        try {
          const { text, count } = await generateAppealsTranscript(channel, interaction.user.tag);
          const file = new AttachmentBuilder(Buffer.from(text, 'utf-8'), { name: `${channel.name}-transcript.txt` });
          const transcriptCh = await client.channels.fetch(config.appealsTranscriptCh);
          await transcriptCh.send({
            embeds: [new EmbedBuilder().setTitle('🔒 Ticket Closed').setDescription(`**Channel:** ${channel.name}\n**Closed by:** ${interaction.user.tag}\n**Messages:** ${count}`).setColor(0xED4245).setTimestamp()],
            files: [file],
          });
        } catch (err) {
          console.error('[Appeals] Transcript error:', err.message);
        }

        const topic = channel.topic || '';
        const openerMatch = topic.match(/opener:(\d+)/);
        if (openerMatch) {
          await channel.permissionOverwrites.edit(openerMatch[1], { ViewChannel: false }).catch(() => {});
        }
        if (!channel.name.startsWith('closed-')) {
          await channel.setName(`closed-${channel.name}`.slice(0, 100)).catch(() => {});
        }

        const controlsRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('appeals_reopen').setLabel('Reopen').setStyle(ButtonStyle.Success).setEmoji('🔓'),
          new ButtonBuilder().setCustomId('appeals_transcript').setLabel('Transcript').setStyle(ButtonStyle.Primary).setEmoji('📄'),
          new ButtonBuilder().setCustomId('appeals_delete').setLabel('Delete').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
        );
        await channel.send({
          embeds: [new EmbedBuilder().setTitle('Ticket Closed').setDescription(`Closed by **${interaction.user.tag}**`).setColor(0xED4245).setTimestamp()],
          components: [controlsRow],
        });
        await interaction.message.delete().catch(() => {});
        return;
      }

      if (interaction.customId === 'appeals_reopen') {
        if (!isAppealsStaff) return interaction.reply({ content: '❌ Only staff can reopen tickets.', ephemeral: true });
        await interaction.deferUpdate();
        const channel = interaction.channel;
        const topic   = channel.topic || '';
        const openerMatch = topic.match(/opener:(\d+)/);
        if (openerMatch) {
          await channel.permissionOverwrites.edit(openerMatch[1], {
            ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
          }).catch(() => {});
        }
        if (channel.name.startsWith('closed-')) {
          await channel.setName(channel.name.slice(7)).catch(() => {});
        }
        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('appeals_close').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        );
        await channel.send({
          embeds: [new EmbedBuilder().setTitle('Ticket Reopened').setDescription(`Reopened by **${interaction.user.tag}**`).setColor(0x57F287).setTimestamp()],
          components: [closeRow],
        });
        return;
      }

      if (interaction.customId === 'appeals_transcript') {
        if (!isAppealsStaff) return interaction.reply({ content: '❌ Only staff can generate transcripts.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        try {
          const { text, count } = await generateAppealsTranscript(interaction.channel, interaction.user.tag);
          const file = new AttachmentBuilder(Buffer.from(text, 'utf-8'), { name: `${interaction.channel.name}-transcript.txt` });
          const transcriptCh = await client.channels.fetch(config.appealsTranscriptCh);
          await transcriptCh.send({
            embeds: [new EmbedBuilder().setTitle('📄 Ticket Transcript').setDescription(`**Channel:** ${interaction.channel.name}\n**Generated by:** ${interaction.user.tag}\n**Messages:** ${count}`).setColor(0x5865F2).setTimestamp()],
            files: [file],
          });
          return interaction.editReply({ content: '✅ Transcript posted to the transcripts channel.' });
        } catch (err) {
          return interaction.editReply({ content: `❌ Failed: ${err.message}` });
        }
      }

      if (interaction.customId === 'appeals_delete') {
        if (!isAppealsStaff) return interaction.reply({ content: '❌ Only staff can delete tickets.', ephemeral: true });
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('appeals_delete_confirm').setLabel('Delete Forever').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
          new ButtonBuilder().setCustomId('appeals_delete_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary).setEmoji('✖️'),
        );
        return interaction.reply({ content: '⚠️ This will permanently delete the ticket. Are you sure?', components: [confirmRow] });
      }

      if (interaction.customId === 'appeals_delete_cancel') {
        return interaction.message.delete().catch(() => {});
      }

      if (interaction.customId === 'appeals_delete_confirm') {
        if (!isAppealsStaff) return interaction.reply({ content: '❌ Only staff can delete tickets.', ephemeral: true });
        await interaction.channel.delete().catch(() => {});
        return;
      }
    }

    // Modals
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'modal_ingame') {
        return createAppealTicket(interaction, {
          category: config.appealsCatRegular, prefix: 'ingame', title: 'In-Game Appeal',
          fields: [
            ['Roblox Username',   interaction.fields.getTextInputValue('roblox_user')],
            ['Punishment Type',   interaction.fields.getTextInputValue('punishment_type')],
            ['Reason Given',      interaction.fields.getTextInputValue('reason_given')],
            ['Explanation',       interaction.fields.getTextInputValue('explanation')],
          ],
        });
      }
      if (interaction.customId === 'modal_discord') {
        return createAppealTicket(interaction, {
          category: config.appealsCatRegular, prefix: 'discord', title: 'Discord Appeal',
          fields: [
            ['Discord Username',  interaction.fields.getTextInputValue('discord_user')],
            ['Punishment Type',   interaction.fields.getTextInputValue('punishment_type')],
            ['Reason Given',      interaction.fields.getTextInputValue('reason_given')],
            ['Explanation',       interaction.fields.getTextInputValue('explanation')],
          ],
        });
      }
      if (interaction.customId === 'modal_staffreport') {
        return createAppealTicket(interaction, {
          category: config.appealsCatStaff, prefix: 'report', title: 'Staff Report',
          fields: [
            ["Staff Member's Username", interaction.fields.getTextInputValue('staff_user')],
            ['What Happened',           interaction.fields.getTextInputValue('what_happened')],
            ['Evidence',                interaction.fields.getTextInputValue('evidence')],
            ['Additional Notes',        interaction.fields.getTextInputValue('notes')],
          ],
        });
      }
    }

    // Slash commands in appeals guild
    if (interaction.isChatInputCommand()) {
      if (!isAppealsStaff) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
      }

      if (interaction.commandName === 'appealspanel') {
        const panelEmbed = new EmbedBuilder()
          .setTitle('📋 Appeals Center')
          .setDescription('Select the type of appeal or report below.\nA staff member will review your submission as soon as possible.')
          .setColor(0x5865F2)
          .setFooter({ text: 'Site 47 Appeals' });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('open_ingame').setLabel('In-Game Appeal').setStyle(ButtonStyle.Primary).setEmoji('🎮'),
          new ButtonBuilder().setCustomId('open_discord').setLabel('Discord Appeal').setStyle(ButtonStyle.Primary).setEmoji('💬'),
          new ButtonBuilder().setCustomId('open_staffreport').setLabel('Staff Report').setStyle(ButtonStyle.Danger).setEmoji('🚨'),
        );
        await interaction.channel.send({ embeds: [panelEmbed], components: [row] });
        return interaction.reply({ content: '✅ Appeals panel posted.', ephemeral: true });
      }

      if (interaction.commandName === 'migrate') {
        const topic = interaction.channel.topic || '';
        if (!topic.includes('opener:')) {
          return interaction.reply({ content: '❌ This command can only be used inside a ticket channel.', ephemeral: true });
        }
        const choice = interaction.options.getString('category');
        const catMap  = { regular: config.appealsCatRegular, staff: config.appealsCatStaff, cyber: config.appealsCatCyber };
        const names   = { regular: 'Regular Appeals', staff: 'Staff Tickets', cyber: 'Cyber Security' };
        await interaction.channel.setParent(catMap[choice], { lockPermissions: false });
        return interaction.reply({ content: `✅ Ticket moved to **${names[choice]}**.`, ephemeral: true });
      }
    }

    return; // unhandled interaction from appeals guild — don't fall through to main guild logic
  }

  // Button: End Poll
  if (interaction.isButton() && interaction.customId.startsWith('endpoll_')) {
    const creatorId = interaction.customId.split('_')[1];
    const isAdmin   = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
    if (interaction.user.id !== creatorId && !isAdmin) {
      return interaction.reply({ content: '❌ Only the poll creator or an administrator can end this poll.', ephemeral: true });
    }
    try {
      await interaction.deferUpdate();
      await interaction.message.delete();
      const pollChannel = await client.channels.fetch(config.ssuPollChannelId);
      await pollChannel.send({ embeds: [buildSettingUpEmbed()] });
      try {
        await setSessionStatus(client, 'settingup');
      } catch (err) {
        console.error('[EndPoll] Status channel update failed:', err.message);
      }
    } catch (err) {
      console.error('[EndPoll] Error:', err);
    }
    return;
  }

  // Button: Punishlogs pagination
  if (interaction.isButton() && interaction.customId.startsWith('punishlogs_')) {
    const parts     = interaction.customId.split('_');
    const direction = parts[1];
    const targetId  = parts[2];
    const curPage   = parseInt(parts[3]);
    const newPage   = direction === 'next' ? curPage + 1 : curPage - 1;

    await interaction.deferUpdate();
    try {
      const target  = await client.users.fetch(targetId).catch(() => null);
      const allRows = await fetchAllLogsForUser(targetId);
      const { embed, components } = buildPunishPage(targetId, target?.username ?? targetId, allRows, newPage);
      await interaction.editReply({ embeds: [embed], components });
    } catch (err) {
      console.error('[punishlogs pagination]', err);
    }
    return;
  }

  // Button: Shift — Adjust Time (sent via DM after 3h reminder)
  if (interaction.isButton() && interaction.customId.startsWith('adjusttime_')) {
    const targetId = interaction.customId.split('_')[1];
    if (interaction.user.id !== targetId) {
      return interaction.reply({ content: '❌ This button is not for you.', ephemeral: true });
    }
    const modal = new ModalBuilder()
      .setCustomId(`shiftadjust_${targetId}`)
      .setTitle('Adjust Shift Time')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('duration')
            .setLabel('New total shift duration (e.g. 2h30m)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('3h, 2h30m, 90m …')
            .setRequired(true),
        ),
      );
    return interaction.showModal(modal);
  }

  // Modal: Shift time adjustment
  if (interaction.isModalSubmit() && interaction.customId.startsWith('shiftadjust_')) {
    const targetId = interaction.customId.split('_')[1];
    const input    = interaction.fields.getTextInputValue('duration');
    const durationMs = parseDurationInput(input);

    if (!durationMs) {
      return interaction.reply({ content: '❌ Invalid time format. Use formats like `3h`, `2h30m`, `90m`.', ephemeral: true });
    }

    try {
      await setTimeOverride(targetId, durationMs);
      await interaction.reply({ content: `✅ Shift time set to **${formatDuration(durationMs)}**. This will be your logged duration when you \`/shiftend\`.` });
    } catch (err) {
      console.error('[ShiftAdjust]', err);
      await interaction.reply({ content: '❌ Something went wrong saving your adjustment.', ephemeral: true });
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  // ── Command tier map ──────────────────────────────────────────────────────
  const COMMAND_TIERS = {
    ping: 'public', larp: 'public', glaze: 'public', findid: 'public',

    warn: 'staff', mute: 'staff', timeout: 'staff', unmute: 'staff', kick: 'staff', ban: 'staff',
    rbxverbalwarn: 'staff', rbxwarn: 'staff', rbxmute: 'staff', rbxkick: 'staff',
    rbxban: 'staff', rbxblacklist: 'staff', rbxglobalblacklist: 'staff',
    shiftstart: 'staff', shiftend: 'staff', shiftcheck: 'staff', shiftleaderboard: 'staff',
    channellock: 'staff', channelunlock: 'staff', serverlock: 'staff', serverunlock: 'staff',
    staffblacklist: 'staff', setpingwarn: 'staff', pingwarnoff: 'staff', pingwarnreset: 'staff',
    purgemessages: 'staff', punishlogs: 'staff', appealsend: 'staff',

    serverpoll: 'ssu', ssumessage: 'ssu', ssdmessage: 'ssu', changehost: 'ssu',
    systemtoggle: 'admin',

    quotacheck: 'admin', settime: 'admin', botlockdown: 'admin', botunlock: 'admin',
    setpermission: 'admin', whitelist: 'admin',
  };

  function tierAllows(userTier, required) {
    if (userTier === 'admin') return true;
    if (required === 'public') return true;
    if (required === 'ssu') return userTier === 'ssu';
    if (required === 'staff') return userTier === 'staff';
    return false;
  }

  const required = COMMAND_TIERS[interaction.commandName] ?? 'admin';

  // ── Lockdown check — block all non-public commands except /botunlock ──────
  if (required !== 'public' && isLocked() && interaction.commandName !== 'botunlock') {
    return interaction.reply({ content: 'THE BOT HAS BEEN LOCKED DOWN BY SITE OFFICIALS.' });
  }

  if (required !== 'public') {
    const userTier = await getTier(interaction.user.id, client);

    let effectiveTier = userTier;
    // Per-server override: admins can grant staff-level access via /setpermission
    if (!tierAllows(userTier, required) && required === 'staff') {
      const overrideRoles = getRoles(interaction.guild.id);
      const hasOverride = interaction.member?.roles?.cache?.some(r => overrideRoles.includes(r.id));
      if (hasOverride) effectiveTier = 'staff';
    }
    // SSU fallback: check the SSU role directly on the member in case main guild fetch failed
    if (!tierAllows(effectiveTier, required) && required === 'ssu') {
      if (interaction.member?.roles?.cache?.has(config.ssuRoleId)) effectiveTier = 'ssu';
    }

    if (!tierAllows(effectiveTier, required)) {
      const labels = { staff: 'Staff', ssu: 'SSU', admin: 'Administrator' };
      return interaction.reply({
        content: `❌ You need the **${labels[required]}** role in the main S47 server to use this command.`,
        ephemeral: true,
      });
    }
  }

  // ── System toggle silent blocks ───────────────────────────────────────────
  const SSU_CMDS   = ['serverpoll', 'ssumessage', 'ssdmessage', 'changehost'];
  const SHIFT_CMDS = ['shiftstart', 'shiftend', 'shiftcheck', 'shiftleaderboard', 'quotacheck'];

  if (SSU_CMDS.includes(interaction.commandName) && !isEnabled('ssu')) return;
  if (SHIFT_CMDS.includes(interaction.commandName) && !isEnabled('shift')) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`[Command Error] /${interaction.commandName}:`, err);
    const msg = { content: '❌ An error occurred running that command.', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
    else await interaction.reply(msg);
  }
});

async function handlePingWarn(message) {
  if (!isEnabled('pingwarn')) return;
  if (message.author.bot || !message.guild || message.mentions.users.size === 0) return;
  if (message.guild.id !== config.mainGuildId) return;
  if (message.reference) return; // ignore replies — mention in a reply doesn't count as a ping

  const allowedRoles = getRoles(message.guild.id);
  const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
  const isMod   = message.member?.roles?.cache?.some(r => allowedRoles.includes(r.id));
  if (isAdmin || isMod) return;

  const uniqueMentioned = [...new Set(message.mentions.users.keys())];

  for (const mentionedId of uniqueMentioned) {
    if (mentionedId === message.author.id) continue;

    const entry = getProtected(mentionedId);
    if (!entry?.enabled) continue;

    const count = incrementPinger(mentionedId, message.author.id);
    const { threshold, autoWarn: shouldAutoWarn } = entry;

    if (count === 1) {
      await message.reply({ content: `⚠️ **Warning** — <@${mentionedId}> does not want to be pinged.`, allowedMentions: { parse: [] } }).catch(() => {});

    } else if (count < threshold) {
      const remaining = threshold - count;
      await message.author.send(
        `⚠️ You have **${remaining}** more ping(s) before a formal warning is issued for pinging <@${mentionedId}>.`
      ).catch(() => {});

    } else {
      const protectedUser = await message.client.users.fetch(mentionedId).catch(() => null);
      const reason = `Repeatedly pinging a protected member (reached ${threshold}-ping threshold) — Ping Protection`;

      let caseId = null;
      if (shouldAutoWarn) {
        try {
          caseId = await autoWarn(message.client, message.guild, message.author, message.client.user, reason);
          await message.reply({ content: `🚨 <@${message.author.id}> has been formally warned (Case #${caseId}) for repeatedly pinging <@${mentionedId}>.`, allowedMentions: { parse: [] } }).catch(() => {});
        } catch (err) {
          console.error('[PingWarn] autoWarn failed:', err);
        }
      } else {
        await message.reply({ content: `⚠️ <@${message.author.id}> has reached the ping limit for <@${mentionedId}>. Mods have been notified.`, allowedMentions: { parse: [] } }).catch(() => {});
      }

      // Always post a forum report to staff punishments
      try {
        const forum = await message.client.channels.fetch(config.staffPunishmentsChannelId);
        const embed = new EmbedBuilder()
          .setTitle('🔔 Ping Warn Report')
          .setColor(shouldAutoWarn ? 0xFEE75C : 0xFFA500)
          .addFields(
            { name: 'Pinger',    value: `<@${message.author.id}> (${message.author.username})`,               inline: true },
            { name: 'Protected', value: `<@${mentionedId}> (${protectedUser?.username ?? mentionedId})`,       inline: true },
            { name: 'Pings',     value: `${count}/${threshold}`,                                               inline: true },
            { name: 'Server',    value: message.guild.name,                                                    inline: true },
            { name: 'Channel',   value: `<#${message.channel.id}>`,                                            inline: true },
            { name: 'Action',    value: shouldAutoWarn ? `Formal warn issued — Case #${caseId}` : 'Manual action required', inline: true },
            { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`,                              inline: false },
          );
        await forum.threads.create({
          name: `Ping Report — ${message.author.username} → ${protectedUser?.username ?? mentionedId}`,
          message: { embeds: [embed] },
          appliedTags: [],
        });
      } catch (err) {
        console.error('[PingWarn] Forum post failed:', err.message);
      }

      if (protectedUser) {
        const notifyMsg = shouldAutoWarn
          ? `🛡️ **${message.author.username}** was automatically warned for pinging you ${threshold} times in **${message.guild.name}**.`
          : `🛡️ **${message.author.username}** reached your ping threshold (${threshold}) in **${message.guild.name}**. Mods have been notified.`;
        await protectedUser.send(notifyMsg).catch(() => {});
      }

      resetPinger(mentionedId, message.author.id);
    }
  }
}

async function handlePermReqFormat(message) {
  if (!isEnabled('permrequest')) return;
  if (message.channel.id !== config.ssuModRequestId) return;
  if (message.author.bot) return;
  if (message.content.includes('!ignore!')) return;

  const hostId = getHost();
  const text = message.content;
  const has = field => new RegExp(`^${field}\\s*:`, 'im').test(text);

  const hasUsername   = has('Username');
  const hasDepartment = has('Department');
  const hasFaction    = has('Faction');
  const hasRank       = has('Rank');

  const valid =
    (hasUsername && hasDepartment && hasRank) ||
    (hasUsername && hasFaction    && hasRank) ||
    (hasUsername && hasRank && !hasDepartment && !hasFaction);

  if (!hostId) return;

  if (!valid) {
    await message.reply(
      `❌ Follow the correct format:\n\n` +
      '**Department Mod**\n```\nUsername: \nDepartment: \nRank: \n```\n' +
      '**Faction Mod**\n```\nUsername: \nFaction: \nRank: \n```\n' +
      '**Normal Mod / Staff / Director O5**\n```\nUsername: \nRank: \n```'
    ).catch(() => {});
    return;
  }

  await message.reply(`<@${hostId}>`).catch(() => {});
}

client.on('messageCreate', async message => {
  handlePrefixCommand(message);
  await handlePingWarn(message);
  await handlePermReqFormat(message);
});

client.on('error', err => console.error('[Client Error]', err));
process.on('unhandledRejection', err => console.error('[Unhandled Rejection]', err));

client.login(config.token);
