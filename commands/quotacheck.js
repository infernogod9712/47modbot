const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getWeeklyShiftData, getAllActiveShifts } = require('../handlers/sheets');
const { getISOWeek, formatDuration, getQuotaTier } = require('../handlers/shiftAction');
const config = require('../config');

function buildQuotaEmbed(totals, week, year) {
  const sorted = [...totals.entries()].sort((a, b) => b[1].ms - a[1].ms);

  return new EmbedBuilder()
    .setTitle(`📊 Quota Check — Week ${week}`)
    .setColor(0x5865F2)
    .setDescription(
      sorted.map(([uid, { ms }]) => {
        const tier = getQuotaTier(ms);
        return `${tier.emoji} <@${uid}> — **${formatDuration(ms)}** (${tier.label})`;
      }).join('\n') || 'No shift data this week.'
    )
    .setFooter({ text: `${sorted.length} staff member(s) with logged time • Week ${week} of ${year}` });
}

async function buildWeeklyTotals(week, year) {
  const [weekRows, activeRows] = await Promise.all([
    getWeeklyShiftData(week, year),
    getAllActiveShifts(),
  ]);

  const totals = new Map();
  for (const r of weekRows) {
    const uid = r[0]; const ms = parseInt(r[4]) || 0;
    const entry = totals.get(uid) ?? { username: r[1], ms: 0 };
    entry.ms += ms;
    totals.set(uid, entry);
  }
  for (const r of activeRows) {
    const uid = r[0]; const running = Date.now() - new Date(r[2]).getTime();
    const entry = totals.get(uid) ?? { username: r[1], ms: 0 };
    entry.ms += running;
    totals.set(uid, entry);
  }
  return totals;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quotacheck')
    .setDescription('View quota status for all staff this week (Admin only)'),

  async execute(interaction) {
    if (interaction.guildId !== config.staffHubGuildId) {
      return interaction.reply({ content: '❌ Shift commands can only be used in the staff hub.', ephemeral: true });
    }
    if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const { week, year } = getISOWeek();
    const totals = await buildWeeklyTotals(week, year);

    await interaction.editReply({ embeds: [buildQuotaEmbed(totals, week, year)] });
  },

  buildWeeklyTotals,
  buildQuotaEmbed,
};
