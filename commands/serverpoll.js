const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverpoll')
    .setDescription('Send a session poll to see who wants to play'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const pollChannel = await interaction.client.channels.fetch(config.ssuPollChannelId);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('【 SESSION POLL! 】')
      .setDescription(
        '─────────────────────────────\n' +
        'A Server Start Up Host is looking to host a session!\n\n' +
        '🟨  **Semi-Serious RP** — Casual but still in character\n' +
        '🟧  **Serious RP** — Full immersive roleplay\n' +
        '🟦  **I\'m Coming Later** — I\'ll join when I can'
      );

    const endButton = new ButtonBuilder()
      .setCustomId(`endpoll_${interaction.user.id}`)
      .setLabel('End Poll')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(endButton);

    const pollMessage = await pollChannel.send({ embeds: [embed], components: [row] });
    await pollMessage.react('🟨');
    await pollMessage.react('🟧');
    await pollMessage.react('🟦');

    await interaction.editReply({ content: '✅ Poll sent!' });
  },
};
