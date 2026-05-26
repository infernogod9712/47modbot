const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits } = require('discord.js');
const { executeModAction, parseDuration } = require('./modAction');
const { getNextCaseId, logAction, getLogsForUser } = require('./sheets');
const { getRoles, addRole, removeRole, getWhitelist, addToWhitelist, removeFromWhitelist } = require('./permissions');
const { setSessionStatus, buildSettingUpEmbed } = require('./ssu');
const config = require('../config');

// Wraps a Message so executeModAction can treat it like an interaction
class MessageContext {
  constructor(message) {
    this.guild   = message.guild;
    this.user    = message.author;
    this.member  = message.member;
    this.client  = message.client;
    this.channel = message.channel;
    this.deferred = false;
    this.replied  = false;
    this._msg    = message;
    this._sent   = null;
  }
  async deferReply() {
    this._sent = await this._msg.reply({ content: '⏳ Processing...' });
    this.deferred = true;
  }
  async editReply({ content, embeds } = {}) {
    await this._sent?.edit({ content: content ?? null, embeds: embeds ?? [] });
  }
  async reply({ content, embeds } = {}) {
    this._sent = await this._msg.reply({ content: content ?? null, embeds: embeds ?? [] });
    this.replied = true;
  }
  async followUp({ content, embeds } = {}) {
    await this._msg.channel.send({ content: content ?? null, embeds: embeds ?? [] });
  }
}

function parseMention(str) {
  const m = str?.match(/^<@!?(\d+)>$/);
  return m ? m[1] : (str?.match(/^\d+$/) ? str : null);
}

function parseRoleMention(str) {
  const m = str?.match(/^<@&(\d+)>$/);
  return m ? m[1] : (str?.match(/^\d+$/) ? str : null);
}

function parseMentionable(str) {
  const user = str?.match(/^<@!?(\d+)>$/);
  if (user) return { id: user[1], type: 'user' };
  const role = str?.match(/^<@&(\d+)>$/);
  if (role) return { id: role[1], type: 'role' };
  return null;
}

async function handlePrefixCommand(message) {
  if (!message.content.startsWith('m!') || message.author.bot) return;

  const args = message.content.slice(2).trim().split(/\s+/);
  const cmd  = args.shift().toLowerCase();
  if (!cmd) return;

  const isAdmin      = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
  const PUBLIC       = ['ping', 'larp', 'glaze'];
  const SSU          = ['serverpoll', 'ssumessage', 'ssdmessage'];

  // Permission gate
  if (!PUBLIC.includes(cmd)) {
    if (SSU.includes(cmd)) {
      const hasSSU = message.member?.roles?.cache?.has(config.ssuRoleId);
      if (!isAdmin && !hasSSU)
        return message.reply({ content: '❌ You do not have permission to use this command.' });
    } else if (cmd !== 'setpermission' && cmd !== 'whitelist') {
      const allowedRoles = getRoles(message.guild.id);
      const hasRole = message.member?.roles?.cache?.some(r => allowedRoles.includes(r.id));
      if (!isAdmin && !hasRole)
        return message.reply({ content: '❌ You do not have permission to use this command.' });
    } else if (cmd === 'setpermission' || cmd === 'whitelist') {
      if (!isAdmin)
        return message.reply({ content: '❌ You need Administrator to use this command.' });
    }
  }

  const ctx = new MessageContext(message);

  try {
    switch (cmd) {

      case 'ping': {
        const sent = await message.reply({ content: 'Pinging...' });
        await sent.edit(`🏓 Pong! Latency: **${sent.createdTimestamp - message.createdTimestamp}ms**`);
        break;
      }

      case 'larp': {
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setDescription('I am the greatest larper of all, i larp all the biggest larpers in the world, no larper can ever match my larp.');
        await message.reply({ embeds: [embed] });
        break;
      }

      case 'glaze': {
        const userId = parseMention(args[0]);
        if (!userId) return message.reply({ content: '❌ Usage: `m!glaze @user`' });
        const embed = new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle('🫧 GLAZING ALERT 🫧')
          .setDescription(
            `<@${userId}> is literally the most incredible, most talented, most breathtaking human being to ever grace this server. ` +
            `Scientists are baffled. Historians are taking notes. The sun rises every morning just to see what <@${userId}> is going to do next. ` +
            `NASA named a star after them. The Pope sent a letter. We are not worthy of their presence and we never will be.`
          );
        await message.reply({ embeds: [embed] });
        break;
      }

      case 'kick': {
        // m!kick @user <reason>
        const userId = parseMention(args[0]);
        if (!userId || args.length < 2) return message.reply({ content: '❌ Usage: `m!kick @user <reason>`' });
        const target = await message.client.users.fetch(userId).catch(() => null);
        if (!target) return message.reply({ content: '❌ User not found.' });
        await executeModAction(ctx, 'kick', target, args.slice(1).join(' '));
        break;
      }

      case 'ban': {
        // m!ban @user <yes|no> <reason>
        const userId = parseMention(args[0]);
        if (!userId || args.length < 3) return message.reply({ content: '❌ Usage: `m!ban @user <yes|no> <reason>`' });
        if (!['yes','no'].includes(args[1].toLowerCase())) return message.reply({ content: '❌ Second argument must be `yes` or `no` for appealable.' });
        const appealable = args[1].toLowerCase() === 'yes';
        const target = await message.client.users.fetch(userId).catch(() => null);
        if (!target) return message.reply({ content: '❌ User not found.' });
        await executeModAction(ctx, 'ban', target, args.slice(2).join(' '), null, appealable);
        break;
      }

      case 'timeout': {
        // m!timeout @user <duration> <reason>
        const userId = parseMention(args[0]);
        if (!userId || args.length < 3) return message.reply({ content: '❌ Usage: `m!timeout @user <duration> <reason>` (e.g. 1h, 30m)' });
        const durationMs = parseDuration(args[1]);
        if (!durationMs) return message.reply({ content: '❌ Invalid duration. Use: `1s` `1m` `1h` `1d`' });
        const target = await message.client.users.fetch(userId).catch(() => null);
        if (!target) return message.reply({ content: '❌ User not found.' });
        await executeModAction(ctx, 'timeout', target, args.slice(2).join(' '), durationMs);
        break;
      }

      case 'mute': {
        // m!mute @user <reason>
        const userId = parseMention(args[0]);
        if (!userId || args.length < 2) return message.reply({ content: '❌ Usage: `m!mute @user <reason>`' });
        const target = await message.client.users.fetch(userId).catch(() => null);
        if (!target) return message.reply({ content: '❌ User not found.' });
        await executeModAction(ctx, 'mute', target, args.slice(1).join(' '));
        break;
      }

      case 'unmute': {
        // m!unmute @user <reason>
        const userId = parseMention(args[0]);
        if (!userId || args.length < 2) return message.reply({ content: '❌ Usage: `m!unmute @user <reason>`' });
        const target = await message.client.users.fetch(userId).catch(() => null);
        if (!target) return message.reply({ content: '❌ User not found.' });
        await executeModAction(ctx, 'unmute', target, args.slice(1).join(' '));
        break;
      }

      case 'warn': {
        // m!warn @user <reason>
        const userId = parseMention(args[0]);
        if (!userId || args.length < 2) return message.reply({ content: '❌ Usage: `m!warn @user <reason>`' });
        const target = await message.client.users.fetch(userId).catch(() => null);
        if (!target) return message.reply({ content: '❌ User not found.' });
        await executeModAction(ctx, 'warn', target, args.slice(1).join(' '));
        break;
      }

      case 'globalban': {
        // m!globalban @user <yes|no> <reason>
        const userId = parseMention(args[0]);
        if (!userId || args.length < 3) return message.reply({ content: '❌ Usage: `m!globalban @user <yes|no> <reason>`' });
        if (!['yes','no'].includes(args[1].toLowerCase())) return message.reply({ content: '❌ Second argument must be `yes` or `no` for appealable.' });
        const appealable = args[1].toLowerCase() === 'yes';
        const reason = args.slice(2).join(' ');
        const target = await message.client.users.fetch(userId).catch(() => null);
        if (!target) return message.reply({ content: '❌ User not found.' });

        await ctx.deferReply();

        try {
          const dmEmbed = new EmbedBuilder()
            .setTitle('S47 Moderation Notice')
            .setColor(0xFF0000)
            .setDescription('You have been **globally banned** from all S47 servers.')
            .addFields(
              { name: 'Reason',     value: reason,                    inline: false },
              { name: 'Appealable', value: appealable ? 'Yes' : 'No', inline: true },
            );
          await target.send({ embeds: [dmEmbed] });
        } catch { /* DMs disabled */ }

        let success = 0, failed = 0;
        const failedServers = [];
        for (const [, guild] of message.client.guilds.cache) {
          try {
            await guild.members.ban(target.id, { reason: `[GLOBAL BAN] ${reason}`, deleteMessageSeconds: 0 });
            success++;
          } catch {
            failed++;
            failedServers.push(guild.name);
          }
        }

        const caseId   = await getNextCaseId();
        const timestamp = new Date().toISOString();
        await logAction({
          caseId, timestamp,
          server: `ALL SERVERS (${success} applied)`,
          action: 'GLOBAL BAN',
          user: target.username, userId: target.id,
          mod: message.author.username, modId: message.author.id,
          reason,
        });

        try {
          const staffHub = await message.client.guilds.fetch(config.staffHubGuildId);
          const forum    = await staffHub.channels.fetch(config.modLogsForumId);
          if (forum?.isThreadOnly()) {
            const banTag    = forum.availableTags.find(t => t.name === 'Discord Ban');
            const appealTag = forum.availableTags.find(t => t.name === (appealable ? 'Appealable' : 'Unappealable'));
            const appliedTags = [banTag, appealTag].filter(Boolean).map(t => t.id);
            const embed = new EmbedBuilder()
              .setTitle(`Case #${caseId} — GLOBAL BAN`)
              .setColor(0xFF0000)
              .addFields(
                { name: 'Action',     value: 'GLOBAL BAN',                                 inline: true },
                { name: 'User',       value: `<@${target.id}> (${target.username})`,        inline: true },
                { name: 'Moderator',  value: `<@${message.author.id}> (${message.author.username})`, inline: true },
                { name: 'Servers',    value: `${success} banned, ${failed} failed`,         inline: true },
                { name: 'Appealable', value: appealable ? 'Yes' : 'No',                    inline: true },
                { name: 'Timestamp',  value: `<t:${Math.floor(Date.now() / 1000)}:F>`,     inline: true },
                { name: 'Reason',     value: reason,                                        inline: false },
              );
            if (failedServers.length) embed.addFields({ name: 'Failed in', value: failedServers.join(', '), inline: false });
            await forum.threads.create({
              name: `Case #${caseId} — GLOBAL BAN — ${target.username}`,
              message: { embeds: [embed] },
              appliedTags,
            });
          }
        } catch (err) { console.error('[prefix globalban] Forum failed:', err.message); }

        await ctx.editReply({
          content: `✅ **GLOBAL BAN** | Case #${caseId}\n👤 **User:** ${target.username}\n📋 **Reason:** ${reason}\n⚖️ **Appealable:** ${appealable ? 'Yes' : 'No'}\n🌐 **Servers:** ${success} banned${failed ? `, ${failed} failed (${failedServers.join(', ')})` : ''}`,
        });
        break;
      }

      case 'punishlogs': {
        // m!punishlogs @user
        const userId = parseMention(args[0]);
        if (!userId) return message.reply({ content: '❌ Usage: `m!punishlogs @user`' });
        const target = await message.client.users.fetch(userId).catch(() => null);
        if (!target) return message.reply({ content: '❌ User not found.' });

        await ctx.deferReply();
        const rows = await getLogsForUser(target.id);
        if (rows.length === 0) return ctx.editReply({ content: `✅ No punishment logs found for **${target.username}**.` });

        const recent = rows.slice(-10).reverse();
        const fields = recent.map(row => {
          const [caseId, timestamp, server, action, , , mod, , reason] = row;
          const date = timestamp ? `<t:${Math.floor(new Date(timestamp).getTime() / 1000)}:d>` : 'Unknown';
          return { name: `Case #${caseId} — ${action} (${date})`, value: `**Server:** ${server}\n**Mod:** ${mod}\n**Reason:** ${reason}`, inline: false };
        });

        const embed = new EmbedBuilder()
          .setTitle(`Punishment Logs — ${target.username}`)
          .setColor(0x5865F2)
          .setDescription(`**${rows.length}** total punishment(s)${rows.length > 10 ? ' — showing most recent 10' : ''}`)
          .addFields(fields)
          .setFooter({ text: `User ID: ${target.id}` });

        await ctx.editReply({ embeds: [embed] });
        break;
      }

      case 'appealsend': {
        // m!appealsend <caseNumber> [notes...]
        const caseId = parseInt(args[0]);
        if (!caseId || isNaN(caseId)) return message.reply({ content: '❌ Usage: `m!appealsend <caseNumber> [notes]`' });
        const notes = args.slice(1).join(' ') || null;

        await ctx.deferReply();
        try {
          const staffHub = await message.client.guilds.fetch(config.staffHubGuildId);
          const forum    = await staffHub.channels.fetch(config.modLogsForumId);
          if (!forum?.isThreadOnly()) return ctx.editReply({ content: '❌ Could not find the mod logs forum.' });

          let thread = null;
          const active = await forum.threads.fetchActive();
          thread = active.threads.find(t => t.name.startsWith(`Case #${caseId} —`) || t.name.startsWith(`Case #${caseId} -`));
          if (!thread) {
            const archived = await forum.threads.fetchArchived({ limit: 100 });
            thread = archived.threads.find(t => t.name.startsWith(`Case #${caseId} —`) || t.name.startsWith(`Case #${caseId} -`));
          }
          if (!thread) return ctx.editReply({ content: `❌ Could not find a forum post for Case #${caseId}.` });

          const appealedTag = forum.availableTags.find(t => t.name === 'Appealed');
          if (appealedTag) {
            const currentTags = thread.appliedTags.filter(id => id !== appealedTag.id);
            await thread.setAppliedTags([...currentTags, appealedTag.id]);
          }

          const embed = new EmbedBuilder()
            .setTitle(`✅ Appeal Processed — Case #${caseId}`)
            .setColor(0x57F287)
            .addFields(
              { name: 'Processed by', value: `<@${message.author.id}> (${message.author.username})`, inline: true },
              { name: 'Timestamp',    value: `<t:${Math.floor(Date.now() / 1000)}:F>`,               inline: true },
            );
          if (notes) embed.addFields({ name: 'Notes', value: notes, inline: false });

          await thread.send({ embeds: [embed] });
          await ctx.editReply({ content: `✅ Appeal processed for Case #${caseId} — post updated.` });
        } catch (err) {
          console.error('[prefix appealsend]', err);
          await ctx.editReply({ content: `❌ Something went wrong: ${err.message}` });
        }
        break;
      }

      case 'whitelist': {
        // m!whitelist add/remove/list [@target]
        const sub = args[0]?.toLowerCase();
        if (!['add','remove','list'].includes(sub)) return message.reply({ content: '❌ Usage: `m!whitelist <add|remove|list> [@target]`' });
        const guildId = message.guild.id;

        if (sub === 'list') {
          const wl    = getWhitelist(guildId);
          const users = wl.users.map(id => `<@${id}>`).join('\n') || 'None';
          const roles = wl.roles.map(id => `<@&${id}>`).join('\n') || 'None';
          return message.reply({ content: `**Whitelisted Users:**\n${users}\n\n**Whitelisted Roles:**\n${roles}` });
        }

        const mentionable = parseMentionable(args[1]);
        if (!mentionable) return message.reply({ content: '❌ Please mention a user or role.' });
        const type    = mentionable.type === 'role' ? 'roles' : 'users';
        const mention = mentionable.type === 'role' ? `<@&${mentionable.id}>` : `<@${mentionable.id}>`;

        if (sub === 'add') {
          addToWhitelist(guildId, type, mentionable.id);
          await message.reply({ content: `✅ ${mention} is now whitelisted — they cannot be punished.` });
        } else {
          removeFromWhitelist(guildId, type, mentionable.id);
          await message.reply({ content: `✅ ${mention} has been removed from the whitelist.` });
        }
        break;
      }

      case 'setpermission': {
        // m!setpermission add/remove/list [@role]
        const sub = args[0]?.toLowerCase();
        if (!['add','remove','list'].includes(sub)) return message.reply({ content: '❌ Usage: `m!setpermission <add|remove|list> [@role]`' });
        const guildId = message.guild.id;

        if (sub === 'list') {
          const roles = getRoles(guildId);
          const list  = roles.map(id => `<@&${id}>`).join('\n') || 'None';
          return message.reply({ content: `**Allowed Roles:**\n${list}` });
        }

        const roleId = parseRoleMention(args[1]);
        if (!roleId) return message.reply({ content: '❌ Please mention a role.' });

        if (sub === 'add') {
          addRole(guildId, roleId);
          await message.reply({ content: `✅ <@&${roleId}> can now use mod commands.` });
        } else {
          removeRole(guildId, roleId);
          await message.reply({ content: `✅ <@&${roleId}> can no longer use mod commands.` });
        }
        break;
      }

      case 'serverpoll': {
        const pollChannel = await message.client.channels.fetch(config.ssuPollChannelId);
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('【 SESSION POLL! 】')
          .setDescription(
            '─────────────────────────────\n' +
            'A Server Start Up Host is looking to host a session!\n\n' +
            '🟨  **Semi-Serious RP** — Casual but still in character\n' +
            '🟧  **Serious RP** — Full immersive roleplay\n' +
            '🟦  **I\'m Coming Later** — I\'ll join when I can'
          );
        const endButton = new ButtonBuilder()
          .setCustomId(`endpoll_${message.author.id}`)
          .setLabel('End Poll')
          .setStyle(ButtonStyle.Danger);
        const row = new ActionRowBuilder().addComponents(endButton);
        const pollMsg = await pollChannel.send({ embeds: [embed], components: [row] });
        await pollMsg.react('🟨');
        await pollMsg.react('🟧');
        await pollMsg.react('🟦');
        await message.reply({ content: '✅ Poll sent!' });
        break;
      }

      case 'ssumessage': {
        // m!ssumessage @ssuh <serious|semi> <max_players> <xp_required> <profile_link> [server title...]
        if (args.length < 5) return message.reply({ content: '❌ Usage: `m!ssumessage @ssuh <serious|semi> <max_players> <xp_required> <profile_link> [server title]`' });
        const ssuhId = parseMention(args[0]);
        if (!ssuhId) return message.reply({ content: '❌ Please mention the SSUH.' });
        const modeInput = args[1].toLowerCase();
        if (!['serious','semi','semi-serious'].includes(modeInput)) return message.reply({ content: '❌ Mode must be `serious` or `semi`.' });
        const mode = modeInput === 'serious' ? 'Serious' : 'Semi-Serious';
        const maxPlayers = parseInt(args[2]);
        const xpRequired = parseInt(args[3]);
        if (isNaN(maxPlayers) || isNaN(xpRequired)) return message.reply({ content: '❌ Max players and XP required must be numbers.' });
        const profileLink = args[4];
        const customTitle = args.slice(5).join(' ') || null;
        const serverTitle = customTitle ?? `「Site 47」|「${mode} Roleplay」`;

        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('【 SERVER START UP! 】')
          .setDescription(
            '─────────────────────────────\n' +
            `**Server Title:** ${serverTitle}\n` +
            `**SSUH:** <@${ssuhId}>\n` +
            `**Max Player Count:** ${maxPlayers}\n` +
            `**XP Required:** ${xpRequired}\n` +
            '─────────────────────────────\n' +
            `Go to <#${config.ssuModRequestId}> and <#${config.ssuMorphRequestId}> to request your morph.\n` +
            'Remember to follow format or your request will be ignored.\n\n' +
            "You can go to the SSUH's profile link here if you want to join from there.\n" +
            profileLink
          );

        const startupChannel = await message.client.channels.fetch(config.ssuStartupChannelId);
        await startupChannel.send({ embeds: [embed] });
        await message.reply({ content: '✅ Start up message sent! Status set to 🟢 ONLINE.' });
        setSessionStatus(message.client, 'online').catch(err =>
          console.error('[prefix ssumessage] Status update failed:', err.message)
        );
        break;
      }

      case 'ssdmessage': {
        // m!ssdmessage (with image attachment)
        const attachment = message.attachments.first();
        if (!attachment) return message.reply({ content: '❌ Please attach a screenshot of everyone online at shutdown.' });

        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('【 SERVER SHUTDOWN! 】')
          .setDescription(
            '─────────────────────────────\n' +
            'The server has been shut down.\n' +
            'Thank you for playing with us today!\n\n' +
            'See you next session. 👋'
          )
          .setImage(attachment.url);

        // Delete last startup message
        try {
          const startupChannel = await message.client.channels.fetch(config.ssuStartupChannelId);
          const messages = await startupChannel.messages.fetch({ limit: 1 });
          const last = messages.first();
          if (last) await last.delete();
        } catch (err) {
          console.error('[prefix ssdmessage] Could not delete startup message:', err.message);
        }

        const shutdownChannel = await message.client.channels.fetch(config.ssuShutdownChannelId);
        await shutdownChannel.send({ embeds: [embed] });
        await message.reply({ content: '✅ Shutdown message sent! Status set to 🔴 OFFLINE.' });
        setSessionStatus(message.client, 'offline').catch(err =>
          console.error('[prefix ssdmessage] Status update failed:', err.message)
        );
        break;
      }

      default:
        // Unknown command — silently ignore
        break;
    }
  } catch (err) {
    console.error(`[prefix] m!${cmd} error:`, err);
    await message.reply({ content: `❌ Something went wrong: ${err.message}` }).catch(() => {});
  }
}

module.exports = { handlePrefixCommand };
