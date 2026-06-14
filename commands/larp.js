const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const LARP_LINES = [
  `{sender} has absolutely larped {receiver} into oblivion. {receiver} tried to compete and failed so hard he got sent to the shadow realm`,
  `LARP ALERT: {sender} just out-larped {receiver} on every single level. {receiver} is still trying to figure out what happened.`,
  `{sender} looked at {receiver} and said "hold my drink." {receiver} has never larped a day in their life compared to this.`,
  `Breaking news: {sender} has larped {receiver} so hard that {receiver} has filed an official complaint. It was denied.`,
  `The council has voted. {sender} has larped {receiver} and there is no appeal process.`,
  `{receiver} thought they were built different. {sender} showed up and larped them back to reality. It wasn't even close.`,
  `{sender} has larped {receiver} with such precision that scientists are still studying the footage. {receiver} has no comment.`,
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('larp')
    .setDescription('Call someone out for larping')
    .addUserOption(opt =>
      opt.setName('target')
        .setDescription('The larper to call out')
        .setRequired(true)
    ),

  async execute(interaction) {
    const sender = interaction.user;
    const target = interaction.options.getUser('target');

    if (target.id === sender.id) {
      return interaction.reply({ content: 'You cannot larp yourself. Touch grass.', ephemeral: true });
    }

    const line = LARP_LINES[Math.floor(Math.random() * LARP_LINES.length)]
      .replace(/{sender}/g, `**${sender.displayName ?? sender.username}**`)
      .replace(/{receiver}/g, `**${target.displayName ?? target.username}**`);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('⚔️ LARP DECLARED')
      .setDescription(line)
      .setFooter({ text: `${sender.username} vs ${target.username}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
