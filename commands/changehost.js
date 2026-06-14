const { SlashCommandBuilder } = require('discord.js');
const { setHost } = require('../handlers/session');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('changehost')
    .setDescription('Announce a new session host')
    .addUserOption(opt =>
      opt.setName('host').setDescription('The new host').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const newHost = interaction.options.getUser('host');
    const startupChannel = await interaction.client.channels.fetch(config.ssuStartupChannelId);

    setHost(newHost.id);
    await startupChannel.send(`The new host is <@${newHost.id}>`);
    await interaction.editReply({ content: `✅ Announced <@${newHost.id}> as the new host.` });
  },
};
