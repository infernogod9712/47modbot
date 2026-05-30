const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getProtected, setProtected } = require('../handlers/pingWarn');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pingwarnoff')
    .setDescription('Disable your ping protection'),

  async execute(interaction) {
    const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
    const hasRole = interaction.member?.roles?.cache?.some(r => (config.pingWarnRoleIds ?? []).includes(r.id));

    if (!isAdmin && !hasRole) {
      return interaction.reply({ content: '❌ Only high command members can use ping protection.', ephemeral: true });
    }

    const existing = getProtected(interaction.user.id);
    if (!existing || !existing.enabled) {
      return interaction.reply({ content: '⚠️ Your ping protection is already off.', ephemeral: true });
    }

    setProtected(interaction.user.id, { ...existing, enabled: false });
    await interaction.reply({ content: '🔓 Ping protection disabled.', ephemeral: true });
  },
};
