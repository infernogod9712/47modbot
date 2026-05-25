const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('appealsend')
    .setDescription('Mark a punishment as appealed in the mod logs forum')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addIntegerOption(opt =>
      opt.setName('case').setDescription('Case number to appeal').setRequired(true).setMinValue(1))
    .addStringOption(opt =>
      opt.setName('notes').setDescription('Optional notes about the appeal outcome').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const caseId = interaction.options.getInteger('case');
    const notes  = interaction.options.getString('notes');
    const mod    = interaction.user;

    try {
      const staffHub = await interaction.client.guilds.fetch(config.staffHubGuildId);
      const forum    = await staffHub.channels.fetch(config.modLogsForumId);

      if (!forum || !forum.isThreadOnly()) {
        return interaction.editReply({ content: '❌ Could not find the mod logs forum.' });
      }

      // Search active threads first, then archived
      let thread = null;
      const active = await forum.threads.fetchActive();
      thread = active.threads.find(t => t.name.startsWith(`Case #${caseId} —`) || t.name.startsWith(`Case #${caseId} -`));

      if (!thread) {
        const archived = await forum.threads.fetchArchived({ limit: 100 });
        thread = archived.threads.find(t => t.name.startsWith(`Case #${caseId} —`) || t.name.startsWith(`Case #${caseId} -`));
      }

      if (!thread) {
        return interaction.editReply({ content: `❌ Could not find a forum post for Case #${caseId}. It may be too old to retrieve.` });
      }

      // Apply the Appealed tag
      const appealedTag = forum.availableTags.find(t => t.name === 'Appealed');
      if (appealedTag) {
        const currentTags = thread.appliedTags.filter(id => id !== appealedTag.id);
        await thread.setAppliedTags([...currentTags, appealedTag.id]);
      }

      // Send appeal message in the thread
      const embed = new EmbedBuilder()
        .setTitle(`✅ Appeal Processed — Case #${caseId}`)
        .setColor(0x57F287)
        .addFields(
          { name: 'Processed by', value: `<@${mod.id}> (${mod.username})`, inline: true },
          { name: 'Timestamp',    value: `<t:${Math.floor(Date.now() / 1000)}:F>`,    inline: true },
        );
      if (notes) embed.addFields({ name: 'Notes', value: notes, inline: false });

      await thread.send({ embeds: [embed] });

      await interaction.editReply({ content: `✅ Appeal processed for Case #${caseId} — post updated.` });

    } catch (err) {
      console.error('[appealsend] Error:', err);
      await interaction.editReply({ content: `❌ Something went wrong: ${err.message}` });
    }
  },
};
