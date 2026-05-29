const { Client, GatewayIntentBits, Collection, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const cron = require('node-cron');
const { getRoles } = require('./handlers/permissions');
const { isLocked } = require('./handlers/lockdown');
const { setSessionStatus, buildSettingUpEmbed } = require('./handlers/ssu');
const { handlePrefixCommand } = require('./handlers/prefixHandler');
const { fetchAllLogsForUser, getWeeklyShiftData, getAllActiveShifts, setTimeOverride } = require('./handlers/sheets');
const { buildPunishPage } = require('./commands/punishlogs');
const { buildWeeklyTotals, buildQuotaEmbed } = require('./commands/quotacheck');
const { getISOWeek, parseDurationInput, formatDuration, scheduleAllReminders } = require('./handlers/shiftAction');
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

  const PUBLIC_COMMANDS = ['ping', 'larp', 'glaze', 'findid'];
  if (PUBLIC_COMMANDS.includes(interaction.commandName)) {
    try { await command.execute(interaction); } catch (err) {
      console.error(`[Command Error] /${interaction.commandName}:`, err);
      const msg = { content: '❌ An error occurred running that command.', ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
      else await interaction.reply(msg);
    }
    return;
  }

  // Lockdown check — block all non-public commands except /botunlock
  if (isLocked() && interaction.commandName !== 'botunlock') {
    return interaction.reply({ content: 'THE BOT HAS BEEN LOCKED DOWN BY SITE OFFICIALS.' });
  }

  const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);

  const SSU_COMMANDS   = ['serverpoll', 'ssumessage', 'ssdmessage'];
  const RBX_COMMANDS   = ['rbxverbalwarn', 'rbxwarn', 'rbxmute', 'rbxkick', 'rbxban', 'rbxblacklist', 'rbxglobalblacklist'];
  const SHIFT_COMMANDS    = ['shiftstart', 'shiftend', 'shiftcheck', 'quotacheck', 'shiftleaderboard', 'settime'];
  const SELF_REG_COMMANDS = ['botlockdown', 'botunlock', 'channellock', 'channelunlock', 'serverlock', 'serverunlock', 'staffblacklist'];

  if (SSU_COMMANDS.includes(interaction.commandName)) {
    const hasSSURole = interaction.member?.roles?.cache?.has(config.ssuRoleId);
    if (!isAdmin && !hasSSURole) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }
  } else if (RBX_COMMANDS.includes(interaction.commandName)) {
    const hasRbxRole = interaction.member?.roles?.cache?.some(r => config.rbxModRoles?.includes(r.id));
    if (!isAdmin && !hasRbxRole) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }
  } else if (SHIFT_COMMANDS.includes(interaction.commandName)) {
    // Shift commands self-regulate
  } else if (SELF_REG_COMMANDS.includes(interaction.commandName)) {
    // These commands handle their own permission checks internally
  } else if (!isAdmin && interaction.commandName !== 'setpermission') {
    const allowedRoles = getRoles(interaction.guild.id);
    const hasRole = interaction.member?.roles?.cache?.some(r => allowedRoles.includes(r.id));
    if (!hasRole) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`[Command Error] /${interaction.commandName}:`, err);
    const msg = { content: '❌ An error occurred running that command.', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
    else await interaction.reply(msg);
  }
});

client.on('messageCreate', message => handlePrefixCommand(message));

client.on('error', err => console.error('[Client Error]', err));
process.on('unhandledRejection', err => console.error('[Unhandled Rejection]', err));

client.login(config.token);
