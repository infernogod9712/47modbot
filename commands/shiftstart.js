const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { startShift, getActiveShift } = require('../handlers/sheets');
const { scheduleReminder, formatDuration } = require('../handlers/shiftAction');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shiftstart')
    .setDescription('Start your moderation shift'),

  async execute(interaction) {
    if (interaction.guildId !== config.staffHubGuildId) {
      return interaction.reply({ content: '❌ Shift commands can only be used in the staff hub.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const { id: userId, username } = interaction.user;
    const existing = await getActiveShift(userId);

    if (existing) {
      const elapsed = Date.now() - new Date(existing.row[2]).getTime();
      return interaction.editReply({
        content: `❌ You already have an active shift running for **${formatDuration(elapsed)}**. Use \`/shiftend\` to end it first.`,
      });
    }

    const startTime = new Date().toISOString();
    await startShift(userId, username, startTime);
    scheduleReminder(interaction.client, userId, startTime);

    const embed = new EmbedBuilder()
      .setTitle('🟢 Shift Started')
      .setColor(0x57F287)
      .addFields(
        { name: 'Moderator',  value: `<@${userId}>`,                                 inline: true },
        { name: 'Started At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`,       inline: true },
      )
      .setFooter({ text: 'Use /shiftend to log your shift when you\'re done.' });

    await interaction.editReply({ embeds: [embed] });
  },
};
