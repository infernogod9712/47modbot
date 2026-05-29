const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('findid')
    .setDescription('Find the Discord ID of a user')
    .addUserOption(opt =>
      opt.setName('user').setDescription('The user to look up').setRequired(true)),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    await interaction.reply({ content: `**${user.username}** → \`${user.id}\``, ephemeral: true });
  },
};
