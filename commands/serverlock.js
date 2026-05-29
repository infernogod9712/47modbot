const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverlock')
    .setDescription('Disable @everyone send messages server-wide (Admin only)'),

  async execute(interaction) {
    if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const everyone = interaction.guild.roles.everyone;
    await everyone.setPermissions(everyone.permissions.remove(PermissionFlagsBits.SendMessages));

    await interaction.editReply({ content: '🔒 Server locked. @everyone can no longer send messages.' });
  },
};
