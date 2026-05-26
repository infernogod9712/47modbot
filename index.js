const { Client, GatewayIntentBits, Collection, PermissionFlagsBits } = require('discord.js');
const { getRoles } = require('./handlers/permissions');
const { setSessionStatus, buildSettingUpEmbed } = require('./handlers/ssu');
const config = require('./config');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// Load all command files from /commands
client.commands = new Collection();
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

client.once('ready', () => {
  console.log(`[47ModBot] Online as ${client.user.tag}`);
  console.log(`[47ModBot] In ${client.guilds.cache.size} server(s)`);
});

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

  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  const PUBLIC_COMMANDS = ['ping', 'larp', 'glaze'];
  if (PUBLIC_COMMANDS.includes(interaction.commandName)) {
    try { await command.execute(interaction); } catch (err) {
      console.error(`[Command Error] /${interaction.commandName}:`, err);
      const msg = { content: '❌ An error occurred running that command.', ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
      else await interaction.reply(msg);
    }
    return;
  }

  const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);

  const SSU_COMMANDS = ['serverpoll', 'ssumessage', 'ssdmessage'];
  if (SSU_COMMANDS.includes(interaction.commandName)) {
    const hasSSURole = interaction.member?.roles?.cache?.has(config.ssuRoleId);
    if (!isAdmin && !hasSSURole) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }
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

client.on('error', err => console.error('[Client Error]', err));
process.on('unhandledRejection', err => console.error('[Unhandled Rejection]', err));

client.login(config.token);
