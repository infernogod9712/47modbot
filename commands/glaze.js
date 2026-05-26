const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('glaze')
    .setDescription('Glaze someone to the max')
    .addUserOption(opt =>
      opt.setName('user').setDescription('The person to glaze').setRequired(true)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🫧 GLAZING ALERT 🫧')
      .setDescription(
        `<@${target.id}> is literally the most incredible, most talented, most breathtaking human being to ever grace this server. ` +
        `Scientists are baffled. Historians are taking notes. The sun rises every morning just to see what <@${target.id}> is going to do next. ` +
        `NASA named a star after them. The Pope sent a letter. We are not worthy of their presence and we never will be.`
      );
    await interaction.reply({ embeds: [embed] });
  },
};
