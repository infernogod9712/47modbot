const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getNextCaseId, logAction } = require('../handlers/sheets');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purgemessages')
    .setDescription('Bulk delete messages in this channel')
    .addIntegerOption(opt =>
      opt.setName('amount').setDescription('Number of messages to delete (1–100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addStringOption(opt =>
      opt.setName('reason').setDescription('Reason for the purge').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const amount  = interaction.options.getInteger('amount');
    const reason  = interaction.options.getString('reason');
    const mod     = interaction.user;
    const channel = interaction.channel;

    let deleted;
    try {
      deleted = await channel.bulkDelete(amount, true);
    } catch (err) {
      return interaction.editReply({ content: `❌ Failed to delete messages: ${err.message}` });
    }

    const caseId    = await getNextCaseId();
    const timestamp = new Date().toISOString();

    await logAction({
      caseId,
      timestamp,
      server:  interaction.guild.name,
      action:  'PURGE',
      user:    `${deleted.size} messages in #${channel.name}`,
      userId:  channel.id,
      mod:     mod.username,
      modId:   mod.id,
      reason,
    });

    try {
      const staffHub = await interaction.client.guilds.fetch(config.staffHubGuildId);
      const forum    = await staffHub.channels.fetch(config.modLogsForumId);

      if (forum && forum.isThreadOnly()) {
        const embed = new EmbedBuilder()
          .setTitle(`Case #${caseId} — PURGE`)
          .setColor(0x5865F2)
          .addFields(
            { name: 'Issued by',  value: `<@${mod.id}> (${mod.username})`,         inline: true },
            { name: 'Timestamp',  value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
            { name: '​',          value: '​',                                        inline: true },
            { name: 'Channel',    value: `<#${channel.id}> (${channel.name})`,     inline: true },
            { name: 'Deleted',    value: `${deleted.size} message(s)`,             inline: true },
            { name: '​',          value: '​',                                        inline: true },
            { name: 'Reason',     value: reason,                                   inline: false },
          );

        await forum.threads.create({
          name:        `Case #${caseId} — PURGE — #${channel.name}`,
          message:     { embeds: [embed] },
          appliedTags: [],
        });
      }
    } catch (forumErr) {
      console.error('[purgemessages] Forum post failed:', forumErr.message);
    }

    await interaction.editReply({ content: `✅ Deleted **${deleted.size}** message(s) | Case #${caseId}` });
  },
};
