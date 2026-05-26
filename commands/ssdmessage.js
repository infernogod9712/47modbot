const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { setSessionStatus } = require('../handlers/ssu');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ssdmessage')
    .setDescription('Send a server shutdown message and set status to OFFLINE')
    .addAttachmentOption(opt =>
      opt.setName('screenshot').setDescription('Screenshot of everyone online at shutdown').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const screenshot     = interaction.options.getAttachment('screenshot');
    const shutdownChannel = await interaction.client.channels.fetch(config.ssuShutdownChannelId);

    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('【 SERVER SHUTDOWN! 】')
      .setDescription(
        '─────────────────────────────\n' +
        'The server has been shut down.\n' +
        'Thank you for playing with us today!\n\n' +
        'See you next session. 👋'
      )
      .setImage(screenshot.url);

    await shutdownChannel.send({ embeds: [embed] });

    let statusNote = '';
    try {
      await setSessionStatus(interaction.client, 'offline');
    } catch (err) {
      console.error('[ssdmessage] Status channel update failed:', err.message);
      statusNote = '\n⚠️ Could not update status channel — check bot permissions.';
    }

    await interaction.editReply({ content: `✅ Shutdown message sent! Status set to 🔴 OFFLINE.${statusNote}` });
  },
};
