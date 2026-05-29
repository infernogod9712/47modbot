const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverunlock')
    .setDescription('Re-enable @everyone send messages server-wide (Admin only)'),

  async execute(interaction) {
    if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const everyone = interaction.guild.roles.everyone;
    await everyone.setPermissions(everyone.permissions.add(PermissionFlagsBits.SendMessages));

    await interaction.editReply({ content: '🔓 Server unlocked. @everyone can send messages again.' });
  },
};
