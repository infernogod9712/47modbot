const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { setLocked } = require('../handlers/lockdown');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('botlockdown')
    .setDescription('Lock all bot commands (Admin only)'),

  async execute(interaction) {
    if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    }
    setLocked(true);
    await interaction.reply({ content: '🔒 Bot locked down. All commands are now disabled.' });
  },
};
