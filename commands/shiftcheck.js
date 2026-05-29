const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getActiveShift, getWeeklyShiftData } = require('../handlers/sheets');
const { getISOWeek, formatDuration, getQuotaTier } = require('../handlers/shiftAction');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shiftcheck')
    .setDescription('Check your shift status and weekly quota'),

  async execute(interaction) {
    if (interaction.guildId !== config.staffHubGuildId) {
      return interaction.reply({ content: '❌ Shift commands can only be used in the staff hub.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const userId = interaction.user.id;
    const { week, year } = getISOWeek();

    const [active, weekRows] = await Promise.all([
      getActiveShift(userId),
      getWeeklyShiftData(week, year),
    ]);

    const loggedMs  = weekRows.reduce((sum, r) => sum + (parseInt(r[4]) || 0), 0);
    const currentMs = active ? Date.now() - new Date(active.row[2]).getTime() : 0;
    const totalMs   = loggedMs + currentMs;
    const tier      = getQuotaTier(totalMs);

    const embed = new EmbedBuilder()
      .setTitle('📋 Shift Status')
      .setColor(tier.color)
      .addFields(
        { name: 'Current Shift',    value: active ? `⏱️ Running — ${formatDuration(currentMs)}` : '🔴 Not on shift', inline: false },
        { name: 'Logged This Week', value: formatDuration(loggedMs),                                                  inline: true  },
        { name: 'Total This Week',  value: formatDuration(totalMs),                                                   inline: true  },
        { name: 'Quota Status',     value: `${tier.emoji} ${tier.label}`,                                             inline: true  },
      )
      .setFooter({ text: `Week ${week} of ${year}` });

    await interaction.editReply({ embeds: [embed] });
  },
};
