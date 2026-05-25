const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getLogsForUser } = require('../handlers/sheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('punishlogs')
    .setDescription('Show all punishments logged for a user')

    .addUserOption(opt =>
      opt.setName('user').setDescription('The user to look up').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const target = interaction.options.getUser('user');
    const rows = await getLogsForUser(target.id);

    if (rows.length === 0) {
      return interaction.editReply({ content: `✅ No punishment logs found for **${target.username}**.` });
    }

    // Show most recent 10
    const recent = rows.slice(-10).reverse();
    const fields = recent.map(row => {
      const [caseId, timestamp, server, action, , , mod, , reason] = row;
      const date = timestamp ? `<t:${Math.floor(new Date(timestamp).getTime() / 1000)}:d>` : 'Unknown';
      return {
        name: `Case #${caseId} — ${action} (${date})`,
        value: `**Server:** ${server}\n**Mod:** ${mod}\n**Reason:** ${reason}`,
        inline: false,
      };
    });

    const embed = new EmbedBuilder()
      .setTitle(`Punishment Logs — ${target.username}`)
      .setColor(0x5865F2)
      .setDescription(`**${rows.length}** total punishment(s)${rows.length > 10 ? ' — showing most recent 10' : ''}`)
      .addFields(fields)
      .setFooter({ text: `User ID: ${target.id}` });

    await interaction.editReply({ embeds: [embed] });
  },
};
