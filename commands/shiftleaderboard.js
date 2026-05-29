const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getWeeklyShiftData, getAllActiveShifts } = require('../handlers/sheets');
const { getISOWeek, formatDuration, getQuotaTier } = require('../handlers/shiftAction');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shiftleaderboard')
    .setDescription('View the weekly shift leaderboard'),

  async execute(interaction) {
    if (interaction.guildId !== config.staffHubGuildId) {
      return interaction.reply({ content: '❌ Shift commands can only be used in the staff hub.', ephemeral: true });
    }

    await interaction.deferReply();

    const { week, year } = getISOWeek();
    const [weekRows, activeRows] = await Promise.all([
      getWeeklyShiftData(week, year),
      getAllActiveShifts(),
    ]);

    const totals = new Map();
    for (const r of weekRows) {
      const uid = r[0]; const ms = parseInt(r[4]) || 0;
      const entry = totals.get(uid) ?? { ms: 0 };
      entry.ms += ms;
      totals.set(uid, entry);
    }
    for (const r of activeRows) {
      const uid = r[0]; const running = Date.now() - new Date(r[2]).getTime();
      const entry = totals.get(uid) ?? { ms: 0 };
      entry.ms += running;
      totals.set(uid, entry);
    }

    if (totals.size === 0) {
      return interaction.editReply({ content: '📋 No shift data for this week yet.' });
    }

    const sorted = [...totals.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 10);
    const medals = ['🥇', '🥈', '🥉'];

    const embed = new EmbedBuilder()
      .setTitle(`🏆 Shift Leaderboard — Week ${week}`)
      .setColor(0xFFD700)
      .setDescription(
        sorted.map(([uid, { ms }], i) => {
          const tier = getQuotaTier(ms);
          const place = medals[i] ?? `**${i + 1}.**`;
          return `${place} <@${uid}> — **${formatDuration(ms)}** ${tier.emoji}`;
        }).join('\n')
      )
      .setFooter({ text: `Resets every Monday • Week ${week} of ${year}` });

    await interaction.editReply({ embeds: [embed] });
  },
};
