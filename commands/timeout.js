const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { executeModAction, parseDuration } = require('../handlers/modAction');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Temporarily mute a user (Discord timeout — max 28d)')

    .addUserOption(opt =>
      opt.setName('user').setDescription('The user to timeout').setRequired(true))
    .addStringOption(opt =>
      opt.setName('duration').setDescription('Duration e.g. 10m, 2h, 1d (max 28d)').setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason').setDescription('Reason for the timeout').setRequired(true)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason');

    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
      return interaction.reply({ content: '❌ Invalid duration. Use a format like `10m`, `2h`, or `1d`.', ephemeral: true });
    }
    if (durationMs > 28 * 86_400_000) {
      return interaction.reply({ content: '❌ Discord timeouts max out at 28 days.', ephemeral: true });
    }

    await executeModAction(interaction, 'timeout', target, reason, durationMs);
  },
};
