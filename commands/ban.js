const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { executeModAction } = require('../handlers/modAction');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(opt =>
      opt.setName('user').setDescription('The user to ban').setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason').setDescription('Reason for the ban').setRequired(true))
    .addStringOption(opt =>
      opt.setName('appealable').setDescription('Can this ban be appealed?').setRequired(true)
        .addChoices(
          { name: 'Yes', value: 'yes' },
          { name: 'No',  value: 'no'  },
        )),

  async execute(interaction) {
    const target     = interaction.options.getUser('user');
    const reason     = interaction.options.getString('reason');
    const appealable = interaction.options.getString('appealable') === 'yes';
    await executeModAction(interaction, 'ban', target, reason, null, appealable);
  },
};
