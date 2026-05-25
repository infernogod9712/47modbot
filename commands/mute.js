const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { executeModAction } = require('../handlers/modAction');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Permanently mute a user via role')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt =>
      opt.setName('user').setDescription('The user to mute').setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason').setDescription('Reason for the mute').setRequired(true)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    await executeModAction(interaction, 'mute', target, reason);
  },
};
