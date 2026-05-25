const { EmbedBuilder } = require('discord.js');
const { getNextCaseId, logAction } = require('./sheets');
const config = require('../config');

const ACTION_COLORS = {
  kick:    0xFF8C00,
  ban:     0xFF0000,
  timeout: 0xFFA500,
  mute:    0x808080,
  unmute:  0x57F287,
  warn:    0xFEE75C,
};

// Maps each action to the exact tag name(s) in the mod-moderation-logs forum
const ACTION_TAGS = {
  kick:    ['Discord Kick'],
  ban:     ['Discord Ban'],
  timeout: ['Mute'],
  mute:    ['Mute'],
  unmute:  [],
  warn:    ['Warning'],
};

const DM_MESSAGES = {
  kick:    (server)          => `You have been **kicked** from **${server}**.`,
  ban:     (server)          => `You have been **banned** from **${server}**.`,
  timeout: (server, dur)     => `You have been **timed out** in **${server}** for **${dur}**.`,
  mute:    (server)          => `You have been **muted** in **${server}**.`,
  unmute:  (server)          => `Your mute has been **lifted** in **${server}**.`,
  warn:    (server)          => `You have received a **warning** in **${server}**.`,
};

async function sendPunishmentDM(target, action, server, reason, durationMs, appealable) {
  try {
    const description = DM_MESSAGES[action]?.(server, durationMs ? formatDuration(durationMs) : '') ?? '';
    const embed = new EmbedBuilder()
      .setTitle('S47 Moderation Notice')
      .setColor(ACTION_COLORS[action] ?? 0x5865F2)
      .setDescription(description)
      .addFields({ name: 'Reason', value: reason, inline: false });
    if (appealable !== null) embed.addFields({ name: 'Appealable', value: appealable ? 'Yes' : 'No', inline: true });
    await target.send({ embeds: [embed] });
  } catch {
    // DMs can fail if user has them disabled — silently ignore
  }
}

async function executeModAction(interaction, action, target, reason, durationMs = null, appealable = null) {
  const guild = interaction.guild;
  const mod = interaction.user;

  try {
    // 1. DM the user before acting (so they're reachable before a ban/kick)
    await sendPunishmentDM(target, action, guild.name, reason, durationMs, appealable);

    // 2. Perform the Discord action
    switch (action) {
      case 'kick': {
        const member = await guild.members.fetch(target.id).catch(() => null);
        if (!member) return interaction.reply({ content: '❌ That user is not in this server.', ephemeral: true });
        await member.kick(reason);
        break;
      }
      case 'ban':
        await guild.members.ban(target.id, { reason, deleteMessageSeconds: 0 });
        break;
      case 'timeout': {
        const member = await guild.members.fetch(target.id).catch(() => null);
        if (!member) return interaction.reply({ content: '❌ That user is not in this server.', ephemeral: true });
        await member.timeout(durationMs, reason);
        break;
      }
      case 'mute': {
        const member = await guild.members.fetch(target.id).catch(() => null);
        if (!member) return interaction.reply({ content: '❌ That user is not in this server.', ephemeral: true });
        await member.roles.add(config.muteRoleId, reason);
        break;
      }
      case 'unmute': {
        const member = await guild.members.fetch(target.id).catch(() => null);
        if (!member) return interaction.reply({ content: '❌ That user is not in this server.', ephemeral: true });
        await member.roles.remove(config.muteRoleId, reason);
        break;
      }
      case 'warn':
        // Warn is log-only — no Discord action
        break;
    }

    // 3. Get next case ID and log to Google Sheets
    const caseId = await getNextCaseId();
    const timestamp = new Date().toISOString();
    await logAction({
      caseId,
      timestamp,
      server: guild.name,
      action: action.toUpperCase(),
      user: target.username,
      userId: target.id,
      mod: mod.username,
      modId: mod.id,
      reason,
    });

    // 4. Create forum post in staff hub mod-moderation-logs
    try {
      const staffHub = await interaction.client.guilds.fetch(config.staffHubGuildId);
      const forum = await staffHub.channels.fetch(config.modLogsForumId);
      if (forum && forum.isThreadOnly()) {
        // Build the list of tag names to apply
        const tagNames = [...(ACTION_TAGS[action] ?? [])];
        if (appealable === true)  tagNames.push('Appealable');
        if (appealable === false) tagNames.push('Unappealable');

        const appliedTags = tagNames
          .map(name => forum.availableTags.find(t => t.name === name))
          .filter(Boolean)
          .map(t => t.id);

        const embed = new EmbedBuilder()
          .setTitle(`Case #${caseId} — ${action.toUpperCase()}`)
          .setColor(ACTION_COLORS[action] ?? 0x5865F2)
          .addFields(
            { name: 'Action',     value: action.toUpperCase(),                         inline: true },
            { name: 'User',       value: `<@${target.id}> (${target.username})`,       inline: true },
            { name: 'Moderator',  value: `<@${mod.id}> (${mod.username})`,             inline: true },
            { name: 'Server',     value: guild.name,                                   inline: true },
            { name: 'Timestamp',  value: `<t:${Math.floor(Date.now() / 1000)}:F>`,     inline: true },
            { name: 'Reason',     value: reason,                                       inline: false },
          );
        if (durationMs)           embed.addFields({ name: 'Duration',   value: formatDuration(durationMs),                  inline: true });
        if (appealable !== null)  embed.addFields({ name: 'Appealable', value: appealable ? 'Yes' : 'No', inline: true });

        await forum.threads.create({
          name: `Case #${caseId} — ${action.toUpperCase()} — ${target.username}`,
          message: { embeds: [embed] },
          appliedTags,
        });
      }
    } catch (forumErr) {
      console.error('[modAction] Forum post failed:', forumErr.message);
      // Don't fail the whole command if forum post fails
    }

    // 5. Reply to the moderator
    const durationText  = durationMs     ? `\n⏱️ **Duration:** ${formatDuration(durationMs)}` : '';
    const appealText    = appealable !== null ? `\n⚖️ **Appealable:** ${appealable ? 'Yes' : 'No'}` : '';
    await interaction.reply({
      content: `✅ **${action.toUpperCase()}** | Case #${caseId}\n👤 **User:** ${target.username}\n📋 **Reason:** ${reason}${durationText}${appealText}`,
      ephemeral: true,
    });

  } catch (err) {
    console.error(`[modAction] ${action} error:`, err);
    const msg = err.code === 50013
      ? '❌ I don\'t have permission to do that.'
      : `❌ Something went wrong: ${err.message}`;
    if (interaction.replied || interaction.deferred) await interaction.followUp({ content: msg, ephemeral: true });
    else await interaction.reply({ content: msg, ephemeral: true });
  }
}

function parseDuration(str) {
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const num = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  return num * { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

module.exports = { executeModAction, parseDuration, formatDuration };
