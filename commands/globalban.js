const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getNextCaseId, logAction } = require('../handlers/sheets');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('globalban')
    .setDescription('Ban a user from ALL servers the bot is in')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(opt =>
      opt.setName('user').setDescription('The user to globally ban').setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason').setDescription('Reason for the global ban').setRequired(true))
    .addStringOption(opt =>
      opt.setName('appealable').setDescription('Can this ban be appealed?').setRequired(true)
        .addChoices(
          { name: 'Yes', value: 'yes' },
          { name: 'No',  value: 'no'  },
        )),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const target     = interaction.options.getUser('user');
    const reason     = interaction.options.getString('reason');
    const appealable = interaction.options.getString('appealable') === 'yes';
    const mod        = interaction.user;

    const guilds = interaction.client.guilds.cache;
    let success = 0, failed = 0;
    const failedServers = [];

    for (const [, guild] of guilds) {
      try {
        await guild.members.ban(target.id, { reason: `[GLOBAL BAN] ${reason}`, deleteMessageSeconds: 0 });
        success++;
      } catch {
        failed++;
        failedServers.push(guild.name);
      }
    }

    // Log to Google Sheets
    const caseId = await getNextCaseId();
    const timestamp = new Date().toISOString();
    await logAction({
      caseId,
      timestamp,
      server: `ALL SERVERS (${success} applied)`,
      action: 'GLOBAL BAN',
      user: target.username,
      userId: target.id,
      mod: mod.username,
      modId: mod.id,
      reason,
    });

    // Forum post in staff hub
    try {
      const staffHub = await interaction.client.guilds.fetch(config.staffHubGuildId);
      const forum = await staffHub.channels.fetch(config.modLogsForumId);
      if (forum && forum.isThreadOnly()) {
        const banTag     = forum.availableTags.find(t => t.name === 'Discord Ban');
        const appealTag  = forum.availableTags.find(t => t.name === (appealable ? 'Appealable' : 'Unappealable'));
        const appliedTags = [banTag, appealTag].filter(Boolean).map(t => t.id);

        const embed = new EmbedBuilder()
          .setTitle(`Case #${caseId} — GLOBAL BAN`)
          .setColor(0xFF0000)
          .addFields(
            { name: 'Action',      value: 'GLOBAL BAN',                                  inline: true },
            { name: 'User',        value: `<@${target.id}> (${target.username})`,         inline: true },
            { name: 'Moderator',   value: `<@${mod.id}> (${mod.username})`,               inline: true },
            { name: 'Servers',     value: `${success} banned, ${failed} failed`,          inline: true },
            { name: 'Appealable',  value: appealable ? 'Yes' : 'No',                      inline: true },
            { name: 'Timestamp',   value: `<t:${Math.floor(Date.now() / 1000)}:F>`,       inline: true },
            { name: 'Reason',      value: reason,                                         inline: false },
          );
        if (failedServers.length) embed.addFields({ name: 'Failed in', value: failedServers.join(', '), inline: false });

        await forum.threads.create({
          name: `Case #${caseId} — GLOBAL BAN — ${target.username}`,
          message: { embeds: [embed] },
          appliedTags,
        });
      }
    } catch (forumErr) {
      console.error('[globalban] Forum post failed:', forumErr.message);
    }

    const appealText = appealable ? 'Yes' : 'No';
    await interaction.editReply({
      content: `✅ **GLOBAL BAN** | Case #${caseId}\n👤 **User:** ${target.username}\n📋 **Reason:** ${reason}\n⚖️ **Appealable:** ${appealText}\n🌐 **Servers:** ${success} banned${failed ? `, ${failed} failed (${failedServers.join(', ')})` : ''}`,
    });
  },
};
