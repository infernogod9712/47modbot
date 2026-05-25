const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { executeModAction } = require('../handlers/modAction');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Remove a user\'s mute role')

    .addUserOption(opt =>
      opt.setName('user').setDescription('The user to unmute').setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason').setDescription('Reason for unmuting').setRequired(true)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    await executeModAction(interaction, 'unmute', target, reason);
  },
};
