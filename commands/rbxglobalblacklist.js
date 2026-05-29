const { SlashCommandBuilder } = require('discord.js');
const { executeRbxAction } = require('../handlers/rbxAction');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rbxglobalblacklist')
    .setDescription('Add a user to the global Roblox blacklist (all servers)')
    .addStringOption(opt => opt.setName('ru').setDescription('Roblox username of the offender').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for the punishment').setRequired(true))
    .addStringOption(opt =>
      opt.setName('appealable').setDescription('Can this blacklist be appealed?').setRequired(true)
        .addChoices(
          { name: 'Yes', value: 'yes' },
          { name: 'No',  value: 'no'  },
        ))
    .addUserOption(opt => opt.setName('du').setDescription('Discord account of the offender (if known)').setRequired(false))
    .addStringOption(opt => opt.setName('proof_link').setDescription('Proof link (medal.tv, imgur, etc.)').setRequired(false))
    .addAttachmentOption(opt => opt.setName('proof_file').setDescription('Proof file upload').setRequired(false)),

  async execute(interaction) {
    const appealable = interaction.options.getString('appealable') === 'yes';
    await executeRbxAction(interaction, 'Global Blacklist', appealable);
  },
};
