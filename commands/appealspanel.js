const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('appealspanel')
    .setDescription('Post the Site 47 appeals panel (appeals server only)'),

  async execute(interaction) {
    // Handled in index.js appeals guild block before this runs
    await interaction.reply({ content: '❌ This command only works in the appeals server.', ephemeral: true });
  },
};
