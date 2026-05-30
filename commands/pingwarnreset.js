const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { resetPinger } = require('../handlers/pingWarn');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pingwarnreset')
    .setDescription("Reset a user's ping count against a protected member (Admin only)")
    .addUserOption(opt =>
      opt.setName('protected_user').setDescription('The protected member').setRequired(true))
    .addUserOption(opt =>
      opt.setName('pinger').setDescription("The user whose count to reset").setRequired(true)),

  async execute(interaction) {
    if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    }

    const protectedUser = interaction.options.getUser('protected_user');
    const pinger        = interaction.options.getUser('pinger');
    const success       = resetPinger(protectedUser.id, pinger.id);

    if (success) {
      await interaction.reply({ content: `✅ Reset **${pinger.username}**'s ping count against **${protectedUser.username}**.`, ephemeral: true });
    } else {
      await interaction.reply({ content: `⚠️ No ping record found for **${pinger.username}** against **${protectedUser.username}**.`, ephemeral: true });
    }
  },
};
