const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { executeModAction } = require('../handlers/modAction');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a formal warning to a user')

    .addUserOption(opt =>
      opt.setName('user').setDescription('The user to warn').setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason').setDescription('Reason for the warning').setRequired(true)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    await executeModAction(interaction, 'warn', target, reason);
  },
};
