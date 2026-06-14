const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getNextCaseId, logAction } = require('../handlers/sheets');
const { isWhitelisted } = require('../handlers/permissions');
const config = require('../config');

// Appeals servers — only exempt if the ban is appealable
const APPEALS_GUILDS = ['1383437213433331752', '1500090197621211236'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from all S47 servers')

    .addUserOption(opt =>
      opt.setName('user').setDescription('The user to ban').setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason').setDescription('Reason for the ban').setRequired(true))
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

    if (await isWhitelisted(interaction.guild, target.id)) {
      return interaction.editReply({ content: '❌ That user is whitelisted and cannot be punished.' });
    }

    // DM before banning so they're still reachable
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle('S47 Moderation Notice')
        .setColor(0xFF0000)
        .setDescription('You have been **banned** from all S47 servers.')
        .addFields(
          { name: 'Reason',     value: reason,                    inline: false },
          { name: 'Appealable', value: appealable ? 'Yes' : 'No', inline: true  },
        );
      await target.send({ embeds: [dmEmbed] });
    } catch { /* DMs disabled — ignore */ }

    const guilds = interaction.client.guilds.cache;
    let success = 0, failed = 0;
    const failedServers = [];

    for (const [id, guild] of guilds) {
      if (appealable && APPEALS_GUILDS.includes(id)) continue;
      try {
        await guild.members.ban(target.id, { reason: `[BAN] ${reason}`, deleteMessageSeconds: 0 });
        success++;
      } catch {
        failed++;
        failedServers.push(guild.name);
      }
    }

    const caseId    = await getNextCaseId();
    const timestamp = new Date().toISOString();
    await logAction({
      caseId,
      timestamp,
      server:  `ALL SERVERS (${success} applied)`,
      action:  'BAN',
      user:    target.username,
      userId:  target.id,
      mod:     mod.username,
      modId:   mod.id,
      reason,
    });

    try {
      const staffHub = await interaction.client.guilds.fetch(config.staffHubGuildId);
      const forum    = await staffHub.channels.fetch(config.modLogsForumId);
      if (forum && forum.isThreadOnly()) {
        const banTag     = forum.availableTags.find(t => t.name === 'Discord Ban');
        const appealTag  = forum.availableTags.find(t => t.name === (appealable ? 'Appealable' : 'Unappealable'));
        const appliedTags = [banTag, appealTag].filter(Boolean).map(t => t.id);

        const embed = new EmbedBuilder()
          .setTitle(`Case #${caseId} — BAN`)
          .setColor(0xFF0000)
          .addFields(
            { name: 'Action',     value: 'BAN (All Servers)',                              inline: true  },
            { name: 'User',       value: `<@${target.id}> (${target.username})`,           inline: true  },
            { name: 'Moderator',  value: `<@${mod.id}> (${mod.username})`,                 inline: true  },
            { name: 'Servers',    value: `${success} banned${failed ? `, ${failed} failed` : ''}`, inline: true },
            { name: 'Appealable', value: appealable ? 'Yes' : 'No',                        inline: true  },
            { name: 'Timestamp',  value: `<t:${Math.floor(Date.now() / 1000)}:F>`,         inline: true  },
            { name: 'Reason',     value: reason,                                            inline: false },
          );
        if (failedServers.length) embed.addFields({ name: 'Failed in', value: failedServers.join(', '), inline: false });

        await forum.threads.create({
          name:    `Case #${caseId} — BAN — ${target.username}`,
          message: { embeds: [embed] },
          appliedTags,
        });
      }
    } catch (forumErr) {
      console.error('[ban] Forum post failed:', forumErr.message);
    }

    await interaction.editReply({
      content: `✅ **BAN** | Case #${caseId}\n👤 **User:** ${target.username}\n📋 **Reason:** ${reason}\n⚖️ **Appealable:** ${appealable ? 'Yes' : 'No'}\n🌐 **Servers:** ${success} banned${failed ? `, ${failed} failed (${failedServers.join(', ')})` : ''}`,
    });
  },
};
