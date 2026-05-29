const { SlashCommandBuilder } = require('discord.js');
const { executeRbxAction } = require('../handlers/rbxAction');

const SHARED_OPTIONS = builder => builder
  .addStringOption(opt => opt.setName('ru').setDescription('Roblox username of the offender').setRequired(true))
  .addStringOption(opt => opt.setName('reason').setDescription('Reason for the punishment').setRequired(true))
  .addUserOption(opt => opt.setName('du').setDescription('Discord account of the offender (if known)').setRequired(false))
  .addStringOption(opt => opt.setName('proof_link').setDescription('Proof link (medal.tv, imgur, etc.)').setRequired(false))
  .addAttachmentOption(opt => opt.setName('proof_file').setDescription('Proof file upload').setRequired(false));

module.exports = {
  data: SHARED_OPTIONS(new SlashCommandBuilder()
    .setName('rbxkick')
    .setDescription('Kick a user from the Roblox game')),

  async execute(interaction) {
    await executeRbxAction(interaction, 'Roblox Kick');
  },
};
