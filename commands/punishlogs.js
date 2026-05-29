const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { fetchAllLogsForUser } = require('../handlers/sheets');

const CASES_PER_PAGE = 5;

function buildPunishPage(targetId, targetUsername, allRows, page) {
  const totalPages  = Math.max(1, Math.ceil(allRows.length / CASES_PER_PAGE));
  const clampedPage = Math.max(0, Math.min(page, totalPages - 1));
  const pageRows    = allRows.slice(clampedPage * CASES_PER_PAGE, (clampedPage + 1) * CASES_PER_PAGE);

  const fields = pageRows.map(row => {
    const date = row.timestamp
      ? `<t:${Math.floor(new Date(row.timestamp).getTime() / 1000)}:d>`
      : 'Unknown';
    const sourceTag    = row.source === 'roblox' ? ' [RBX]' : '';
    const subjectLabel = row.source === 'roblox' ? 'RU' : 'User';
    return {
      name:   `Case #${row.caseId} — ${row.action}${sourceTag} (${date})`,
      value:  `**${subjectLabel}:** ${row.subject}\n**Mod:** ${row.mod}\n**Reason:** ${row.reason}`,
      inline: false,
    };
  });

  const embed = new EmbedBuilder()
    .setTitle(`Punishment Logs — ${targetUsername}`)
    .setColor(0x5865F2)
    .setDescription(`**${allRows.length}** total punishment(s)`)
    .addFields(fields.length ? fields : [{ name: 'No cases', value: 'Nothing on this page.', inline: false }])
    .setFooter({ text: `User ID: ${targetId} • Page ${clampedPage + 1} of ${totalPages}` });

  const prevBtn = new ButtonBuilder()
    .setCustomId(`punishlogs_prev_${targetId}_${clampedPage}`)
    .setLabel('◀ Previous')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(clampedPage === 0);

  const nextBtn = new ButtonBuilder()
    .setCustomId(`punishlogs_next_${targetId}_${clampedPage}`)
    .setLabel('Next ▶')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(clampedPage >= totalPages - 1);

  const components = totalPages > 1 ? [new ActionRowBuilder().addComponents(prevBtn, nextBtn)] : [];

  return { embed, components };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('punishlogs')
    .setDescription('Show all punishments logged for a user')
    .addUserOption(opt =>
      opt.setName('user').setDescription('The user to look up').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const target  = interaction.options.getUser('user');
    const allRows = await fetchAllLogsForUser(target.id);

    if (allRows.length === 0) {
      return interaction.editReply({ content: `✅ No punishment logs found for **${target.username}**.` });
    }

    const { embed, components } = buildPunishPage(target.id, target.username, allRows, 0);
    await interaction.editReply({ embeds: [embed], components });
  },

  buildPunishPage,
};
