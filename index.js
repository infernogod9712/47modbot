const { Client, GatewayIntentBits, Collection, PermissionFlagsBits, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const cron = require('node-cron');
const { getRoles, getTier } = require('./handlers/permissions');
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

client.on('interactionCreate', async interaction => {

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
      await message.reply({ content: `⚠️ **Warning** — <@${mentionedId}> does not want to be pinged.` }).catch(() => {});

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
          await message.reply({ content: `🚨 <@${message.author.id}> has been formally warned (Case #${caseId}) for repeatedly pinging <@${mentionedId}>.` }).catch(() => {});
        } catch (err) {
          console.error('[PingWarn] autoWarn failed:', err);
        }
      } else {
        await message.reply({ content: `⚠️ <@${message.author.id}> has reached the ping limit for <@${mentionedId}>. Mods have been notified.` }).catch(() => {});
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
