const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('larp')
    .setDescription('The truth'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setDescription('I am the greatest larper of all, i larp all the biggest larpers in the world, no larper can ever match my larp.');
    await interaction.reply({ embeds: [embed] });
  },
};
