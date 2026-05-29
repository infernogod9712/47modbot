const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { setLocked } = require('../handlers/lockdown');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('botunlock')
    .setDescription('Unlock the bot after a lockdown (Admin only)'),

  async execute(interaction) {
    if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    }
    setLocked(false);
    await interaction.reply({ content: '🔓 Bot unlocked. All commands are now available.' });
  },
};
