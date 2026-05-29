const { EmbedBuilder } = require('discord.js');
const { getNextCaseId, logRbxAction } = require('./sheets');
const config = require('../config');

const ACTION_COLORS = {
  'Verbal Warning':    0xFEE75C,
  'Warning':           0xFFA500,
  'Mute':              0x808080,
  'Roblox Kick':       0xFF8C00,
  'Roblox Ban':        0xFF0000,
  'In-Game Blacklist': 0x8B0000,
  'Global Blacklist':  0x2C2F33,
};

const ACTION_TAGS = {
  'Verbal Warning':    'Verbal Warning',
  'Warning':           'Warning',
  'Mute':              'Mute',
  'Roblox Kick':       'Roblox Kick',
  'Roblox Ban':        'Roblox Ban',
  'In-Game Blacklist': 'In-Game Blacklist',
  'Global Blacklist':  'Global Blacklist',
};

async function executeRbxAction(interaction, action, appealable = null) {
  await interaction.deferReply({ ephemeral: true });

  const ru        = interaction.options.getString('ru');
  const reason    = interaction.options.getString('reason');
  const duUser    = interaction.options.getUser('du');
  const proofLink = interaction.options.getString('proof_link');
  const proofFile = interaction.options.getAttachment('proof_file');
  const mod       = interaction.user;

  if (!proofLink && !proofFile) {
    return interaction.editReply({ content: '❌ You must provide at least one proof (link or file upload).' });
  }

  const proofText = proofLink ?? proofFile.url;
  const duText    = duUser ? `<@${duUser.id}> (${duUser.username})` : 'N/A';

  try {
    const caseId    = await getNextCaseId();
    const timestamp = new Date().toISOString();

    await logRbxAction({
      caseId,
      timestamp,
      action,
      ru,
      du:      duUser?.id       ?? 'N/A',
      duName:  duUser?.username ?? 'N/A',
      mod:     mod.username,
      modId:   mod.id,
      reason,
      proof:   proofText,
    });

    // Forum post in staff hub
    try {
      const staffHub = await interaction.client.guilds.fetch(config.staffHubGuildId);
      const forum    = await staffHub.channels.fetch(config.modLogsForumId);

      if (forum && forum.isThreadOnly()) {
        const punishTag  = forum.availableTags.find(t => t.name === ACTION_TAGS[action]);
        const appealName = appealable === true ? 'Appealable' : 'Unappealable';
        const appealTag  = forum.availableTags.find(t => t.name === appealName);
        const appliedTags = [punishTag, appealTag].filter(Boolean).map(t => t.id);

        const embed = new EmbedBuilder()
          .setTitle(`Case #${caseId} — ${action} — ${ru}`)
          .setColor(ACTION_COLORS[action] ?? 0x5865F2)
          .addFields(
            { name: 'Issued by',  value: `<@${mod.id}> (${mod.username})`,         inline: true },
            { name: 'Timestamp',  value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
            { name: '​',     value: '​',                                  inline: true },
            { name: 'DU',         value: duText,                                    inline: true },
            { name: 'RU',         value: ru,                                        inline: true },
            { name: '​',     value: '​',                                  inline: true },
            { name: 'Punishment', value: action,                                    inline: true },
          );
        if (appealable !== null) embed.addFields({ name: 'Appealable', value: appealable ? 'Yes' : 'No', inline: true });
        embed.addFields(
          { name: 'Reason', value: reason,    inline: false },
          { name: 'Proof',  value: proofText, inline: false },
        );
        if (proofFile?.contentType?.startsWith('image/')) embed.setImage(proofFile.url);

        await forum.threads.create({
          name: `Case #${caseId} — ${action} — ${ru}`,
          message: { embeds: [embed] },
          appliedTags,
        });
      }
    } catch (forumErr) {
      console.error(`[rbxAction] Forum post failed:`, forumErr.message);
    }

    const appealText = appealable !== null ? `\n⚖️ **Appealable:** ${appealable ? 'Yes' : 'No'}` : '';
    await interaction.editReply({
      content: `✅ **${action}** | Case #${caseId}\n👤 **RU:** ${ru}\n📋 **Reason:** ${reason}${appealText}`,
    });

  } catch (err) {
    console.error(`[rbxAction] ${action} error:`, err);
    await interaction.editReply({ content: `❌ Something went wrong: ${err.message}` });
  }
}

module.exports = { executeRbxAction };
