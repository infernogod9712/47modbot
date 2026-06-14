const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { setSessionStatus } = require('../handlers/ssu');
const { setHost } = require('../handlers/session');
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

    // Bulk-clear the entire startup channel
    try {
      const startupChannel = await interaction.client.channels.fetch(config.ssuStartupChannelId);
      const messages = await startupChannel.messages.fetch({ limit: 100 });
      if (messages.size > 0) await startupChannel.bulkDelete(messages, true);
    } catch (err) {
      console.error('[ssdmessage] Could not clear startup channel:', err.message);
    }

    setHost(null);
    await shutdownChannel.send({ embeds: [embed] });
    await interaction.editReply({ content: '✅ Shutdown message sent! Status set to 🔴 OFFLINE.' });

    // Update status channel after replying so it doesn't block
    setSessionStatus(interaction.client, 'offline').catch(err =>
      console.error('[ssdmessage] Status channel update failed:', err.message)
    );
  },
};
