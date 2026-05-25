const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { executeModAction } = require('../handlers/modAction');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user from the server')

    .addUserOption(opt =>
      opt.setName('user').setDescription('The user to kick').setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason').setDescription('Reason for the kick').setRequired(true)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    await executeModAction(interaction, 'kick', target, reason);
  },
};
