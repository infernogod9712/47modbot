const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { endShift, logShiftHistory, getWeeklyShiftData } = require('../handlers/sheets');
const { cancelReminder, getISOWeek, formatDuration, getQuotaTier } = require('../handlers/shiftAction');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shiftend')
    .setDescription('End your moderation shift'),

  async execute(interaction) {
    if (interaction.guildId !== config.staffHubGuildId) {
      return interaction.reply({ content: '❌ Shift commands can only be used in the staff hub.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const { id: userId, username } = interaction.user;
    const endTime = new Date().toISOString();

    const result = await endShift(userId);
    if (!result) {
      return interaction.editReply({ content: '❌ You don\'t have an active shift. Use `/shiftstart` to begin one.' });
    }

    cancelReminder(userId);

    const { startTime, timeOverrideMs } = result;
    const calculatedMs = Date.now() - new Date(startTime).getTime();
    const durationMs = timeOverrideMs ?? calculatedMs;

    const { week, year } = getISOWeek();
    await logShiftHistory({ userId, username, startTime, endTime, durationMs, weekNum: week, year });

    const weekRows = await getWeeklyShiftData(week, year);
    const weeklyMs = weekRows.reduce((sum, r) => sum + (parseInt(r[4]) || 0), 0);
    const tier = getQuotaTier(weeklyMs);

    const embed = new EmbedBuilder()
      .setTitle('🔴 Shift Ended')
      .setColor(0xFF8C00)
      .addFields(
        { name: 'Shift Duration',  value: formatDuration(durationMs),          inline: true },
        { name: 'Weekly Total',    value: formatDuration(weeklyMs),             inline: true },
        { name: 'Quota Status',    value: `${tier.emoji} ${tier.label}`,        inline: true },
      );
    if (timeOverrideMs) embed.setFooter({ text: 'Duration reflects your manual time adjustment.' });

    await interaction.editReply({ embeds: [embed] });
  },
};
