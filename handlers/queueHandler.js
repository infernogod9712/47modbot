const { EmbedBuilder } = require('discord.js');
const { getNextCaseId, logAction, logRbxAction, fetchAllLogsForUser,
        getActiveShift, getWeeklyShiftData, getAllActiveShifts } = require('./sheets');
const { parseDuration, formatDuration: fmtDur } = require('./modAction');
const { getISOWeek, formatDuration, getQuotaTier }                = require('./shiftAction');
const { buildWeeklyTotals }                                        = require('../commands/quotacheck');
const { setEnabled, getAll }                                       = require('./systemToggle');
const { setProtected, getProtected }                               = require('./pingWarn');
const { setHost }                                                  = require('./session');
const { setSessionStatus, buildSettingUpEmbed }                    = require('./ssu');
const config = require('../config');

// ─── helpers ────────────────────────────────────────────────────────────────

async function fetchMod(requesterId, client) {
  try { return await client.users.fetch(requesterId); } catch { return { id: requesterId, username: 'Dashboard' }; }
}

async function fetchTarget(userId, client) {
  return client.users.fetch(userId);
}

async function postForum(client, caseId, action, target, mod, reason, tagNames = [], extra = {}) {
  try {
    const staffHub = await client.guilds.fetch(config.staffHubGuildId);
    const forum    = await staffHub.channels.fetch(config.modLogsForumId);
    if (!forum?.isThreadOnly()) return;
    const appliedTags = tagNames
      .map(n => forum.availableTags.find(t => t.name === n))
      .filter(Boolean)
      .map(t => t.id);

    const fields = [
      { name: 'Action',    value: action.toUpperCase(),                       inline: true },
      { name: 'User',      value: `<@${target.id}> (${target.username})`,     inline: true },
      { name: 'Moderator', value: `<@${mod.id}> (${mod.username})`,           inline: true },
      { name: 'Source',    value: 'Dashboard',                                inline: true },
      { name: 'Timestamp', value: `<t:${Math.floor(Date.now()/1000)}:F>`,     inline: true },
      { name: 'Reason',    value: reason,                                      inline: false },
    ];
    if (extra.duration)   fields.splice(5, 0, { name:'Duration',   value:extra.duration,            inline:true });
    if (extra.appealable !== undefined) fields.splice(5,0,{ name:'Appealable', value:extra.appealable?'Yes':'No', inline:true });

    const embed = new EmbedBuilder()
      .setTitle(`Case #${caseId} — ${action.toUpperCase()}`)
      .setColor(extra.color ?? 0x5865F2)
      .addFields(fields);

    await forum.threads.create({
      name: `Case #${caseId} — ${action.toUpperCase()} — ${target.username}`,
      message: { embeds: [embed] },
      appliedTags,
    });
  } catch (err) {
    console.error('[queueHandler] Forum post failed:', err.message);
  }
}

// ─── mod actions (warn / mute / timeout / unmute / kick / ban) ───────────────

const ACTION_COLORS = { warn:0xFEE75C, mute:0x808080, timeout:0xFFA500, unmute:0x57F287, kick:0xFF8C00, ban:0xFF0000 };
const ACTION_TAGS   = { warn:['Warning'], mute:['Mute'], timeout:['Mute'], unmute:[], kick:['Discord Kick'], ban:['Discord Ban'] };

async function runModAction(action, args, requesterId, client) {
  const target = await fetchTarget(args.user, client);
  const mod    = await fetchMod(requesterId, client);
  const mainGuild = await client.guilds.fetch(config.mainGuildId);

  // DM target
  try {
    const dmDesc = {
      warn:    `You have received a **warning**.`,
      mute:    `You have been **permanently muted** in **${mainGuild.name}**.`,
      timeout: `You have been **timed out** in **${mainGuild.name}** for **${args.duration ?? '?'}**.`,
      unmute:  `Your mute has been **lifted** in **${mainGuild.name}**.`,
      kick:    `You have been **kicked** from **${mainGuild.name}**.`,
      ban:     `You have been **banned** from all S47 servers.`,
    }[action] ?? '';
    const dmEmbed = new EmbedBuilder()
      .setTitle('S47 Moderation Notice')
      .setColor(ACTION_COLORS[action] ?? 0x5865F2)
      .setDescription(dmDesc)
      .addFields({ name:'Reason', value:args.reason, inline:false });
    if (action === 'ban') dmEmbed.addFields({ name:'Appealable', value:args.appealable==='yes'?'Yes':'No', inline:true });
    await target.send({ embeds:[dmEmbed] });
  } catch { /* DMs disabled */ }

  // Perform action
  let durationMs = null;
  switch (action) {
    case 'kick': {
      const member = await mainGuild.members.fetch(target.id).catch(()=>null);
      if (!member) throw new Error('User is not in the main server.');
      await member.kick(args.reason);
      break;
    }
    case 'ban': {
      const guilds = client.guilds.cache;
      const APPEALS = ['1383437213433331752','1500090197621211236'];
      const appealable = args.appealable === 'yes';
      for (const [id, g] of guilds) {
        if (appealable && APPEALS.includes(id)) continue;
        await g.members.ban(target.id, { reason: `[BAN] ${args.reason}`, deleteMessageSeconds:0 }).catch(()=>{});
      }
      break;
    }
    case 'timeout': {
      const member = await mainGuild.members.fetch(target.id).catch(()=>null);
      if (!member) throw new Error('User is not in the main server.');
      durationMs = parseDuration(args.duration ?? '1h');
      if (!durationMs) throw new Error('Invalid duration format. Use: 1h, 30m, 2h30m.');
      await member.timeout(durationMs, args.reason);
      break;
    }
    case 'mute': {
      const member = await mainGuild.members.fetch(target.id).catch(()=>null);
      if (!member) throw new Error('User is not in the main server.');
      await member.roles.add(config.muteRoleId, args.reason);
      break;
    }
    case 'unmute': {
      const member = await mainGuild.members.fetch(target.id).catch(()=>null);
      if (!member) throw new Error('User is not in the main server.');
      await member.roles.remove(config.muteRoleId, args.reason ?? 'Unmuted via dashboard');
      break;
    }
    case 'warn':
      break;
  }

  const caseId    = await getNextCaseId();
  const timestamp = new Date().toISOString();
  await logAction({ caseId, timestamp, server:'All Servers (Dashboard)', action:action.toUpperCase(),
    user:target.username, userId:target.id, mod:mod.username, modId:mod.id, reason:args.reason });

  const tagNames = [...(ACTION_TAGS[action]??[])];
  if (action==='ban') tagNames.push(args.appealable==='yes'?'Appealable':'Unappealable');
  await postForum(client, caseId, action, target, mod, args.reason, tagNames, {
    color: ACTION_COLORS[action],
    duration: durationMs ? fmtDur(durationMs) : undefined,
    appealable: action==='ban' ? args.appealable==='yes' : undefined,
  });

  const durLine = durationMs ? `\n⏱️ Duration: ${fmtDur(durationMs)}` : '';
  const appLine = action==='ban' ? `\n⚖️ Appealable: ${args.appealable==='yes'?'Yes':'No'}` : '';
  return `✅ ${action.toUpperCase()} | Case #${caseId}\n👤 User: ${target.username}\n📋 Reason: ${args.reason}${durLine}${appLine}`;
}

// ─── rbx actions ────────────────────────────────────────────────────────────

const RBX_ACTION_MAP = {
  rbxverbalwarn:    'Verbal Warning',
  rbxwarn:          'Warning',
  rbxmute:          'Mute',
  rbxkick:          'Roblox Kick',
  rbxban:           'Roblox Ban',
  rbxblacklist:     'In-Game Blacklist',
  rbxglobalblacklist:'Global Blacklist',
};
const RBX_COLORS = {
  'Verbal Warning':0xFEE75C,'Warning':0xFFA500,'Mute':0x808080,
  'Roblox Kick':0xFF8C00,'Roblox Ban':0xFF0000,'In-Game Blacklist':0x8B0000,'Global Blacklist':0x2C2F33,
};

async function runRbxAction(cmdName, args, requesterId, client) {
  const action  = RBX_ACTION_MAP[cmdName];
  const mod     = await fetchMod(requesterId, client);
  const proofText = args.proof || 'No proof provided';

  const caseId    = await getNextCaseId();
  const timestamp = new Date().toISOString();
  await logRbxAction({ caseId, timestamp, action, ru:args.ru,
    du:'Dashboard', duName:'Dashboard', mod:mod.username, modId:mod.id,
    reason:args.reason, proof:proofText });

  try {
    const staffHub = await client.guilds.fetch(config.staffHubGuildId);
    const forum    = await staffHub.channels.fetch(config.modLogsForumId);
    if (forum?.isThreadOnly()) {
      const punishTag  = forum.availableTags.find(t => t.name === action);
      const appliedTags = [punishTag].filter(Boolean).map(t => t.id);
      const embed = new EmbedBuilder()
        .setTitle(`Case #${caseId} — ${action} — ${args.ru}`)
        .setColor(RBX_COLORS[action] ?? 0x5865F2)
        .addFields(
          { name:'Issued by',  value:`<@${mod.id}> (${mod.username})`,        inline:true },
          { name:'Timestamp',  value:`<t:${Math.floor(Date.now()/1000)}:F>`,  inline:true },
          { name:'RU',         value:args.ru,                                 inline:true },
          { name:'Punishment', value:action,                                  inline:true },
          { name:'Source',     value:'Dashboard',                             inline:true },
          { name:'Reason',     value:args.reason,                             inline:false },
          { name:'Proof',      value:proofText,                               inline:false },
        );
      if (args.duration) embed.addFields({ name:'Duration', value:args.duration, inline:true });
      await forum.threads.create({ name:`Case #${caseId} — ${action} — ${args.ru}`, message:{embeds:[embed]}, appliedTags });
    }
  } catch (err) { console.error('[queueHandler] Rbx forum post failed:', err.message); }

  return `✅ ${action} | Case #${caseId}\n👤 RU: ${args.ru}\n📋 Reason: ${args.reason}`;
}

// ─── info commands ───────────────────────────────────────────────────────────

async function runPunishlogs(args) {
  const rows = await fetchAllLogsForUser(args.user);
  if (!rows.length) return `No punishment logs found for user ID ${args.user}.`;
  return rows.slice(0, 10).map(r => {
    const tag = r.source === 'roblox' ? ' [RBX]' : '';
    return `Case #${r.caseId} — ${r.action}${tag}\nMod: ${r.mod} | Reason: ${r.reason}`;
  }).join('\n─────────────────\n') + (rows.length > 10 ? `\n\n+${rows.length-10} more entries.` : '');
}

async function runShiftcheck(args) {
  const userId = args.user || args.requested_by;
  const { week, year } = getISOWeek();
  const [active, weekRows] = await Promise.all([getActiveShift(userId), getWeeklyShiftData(week, year)]);
  const loggedMs  = weekRows.reduce((sum, r) => sum + (parseInt(r[4])||0), 0);
  const currentMs = active ? Date.now() - new Date(active.row[2]).getTime() : 0;
  const totalMs   = loggedMs + currentMs;
  const tier      = getQuotaTier(totalMs);
  return [
    `Shift Status — Week ${week}/${year}`,
    `Current Shift: ${active ? `⏱️ Running — ${formatDuration(currentMs)}` : '🔴 Not on shift'}`,
    `Logged this week: ${formatDuration(loggedMs)}`,
    `Total this week: ${formatDuration(totalMs)}`,
    `Quota: ${tier.emoji} ${tier.label}`,
  ].join('\n');
}

async function runShiftleaderboard() {
  const { week, year } = getISOWeek();
  const [weekRows, activeRows] = await Promise.all([getWeeklyShiftData(week, year), getAllActiveShifts()]);
  const totals = new Map();
  for (const r of weekRows) {
    const uid = r[0]; const ms = parseInt(r[4])||0;
    const e = totals.get(uid) ?? {ms:0}; e.ms += ms; totals.set(uid, e);
  }
  for (const r of activeRows) {
    const uid = r[0]; const running = Date.now()-new Date(r[2]).getTime();
    const e = totals.get(uid) ?? {ms:0}; e.ms += running; totals.set(uid, e);
  }
  if (!totals.size) return 'No shift data for this week yet.';
  const sorted = [...totals.entries()].sort((a,b)=>b[1].ms-a[1].ms).slice(0,10);
  const medals = ['🥇','🥈','🥉'];
  const lines = sorted.map(([uid,{ms}],i) => {
    const tier = getQuotaTier(ms);
    return `${medals[i]??`${i+1}.`} <@${uid}> — ${formatDuration(ms)} ${tier.emoji}`;
  });
  return `🏆 Shift Leaderboard — Week ${week}\n\n${lines.join('\n')}`;
}

async function runQuotacheck() {
  const { week, year } = getISOWeek();
  const totals = await buildWeeklyTotals(week, year);
  if (!totals.size) return 'No shift data this week.';
  const sorted = [...totals.entries()].sort((a,b)=>b[1].ms-a[1].ms);
  const lines = sorted.map(([uid,{ms}]) => {
    const tier = getQuotaTier(ms);
    return `${tier.emoji} <@${uid}> — ${formatDuration(ms)} (${tier.label})`;
  });
  return `📊 Quota Check — Week ${week}\n\n${lines.join('\n')}`;
}

// ─── ssu commands ────────────────────────────────────────────────────────────

async function runSsumessage(args, client) {
  const ssuhUser = await client.users.fetch(args.host);
  const serverTitle = args.server_title ?? `「Site 47」|「${args.mode} Roleplay」`;
  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('【 SERVER START UP! 】')
    .setDescription(
      '─────────────────────────────\n' +
      `**Server Title:** ${serverTitle}\n` +
      `**SSUH:** <@${ssuhUser.id}>\n` +
      `**Max Player Count:** ${args.max_players}\n` +
      `**XP Required:** ${args.xp_required}\n` +
      '─────────────────────────────\n' +
      `Go to <#${config.ssuModRequestId}> and <#${config.ssuMorphRequestId}> to request your morph.\n` +
      'Remember to follow format or your request will be ignored.\n\n' +
      "You can go to the SSUH's profile link here if you want to join from there.\n" +
      (args.profile_link ?? '')
    );
  const ch = await client.channels.fetch(config.ssuStartupChannelId);
  await ch.send({ embeds:[embed] });
  setHost(ssuhUser.id);
  setSessionStatus(client, 'online').catch(()=>{});
  return `✅ Start up message sent. Host set to ${ssuhUser.username}.`;
}

async function runSsdmessage(client) {
  const embed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('【 SERVER SHUTDOWN! 】')
    .setDescription('The server has been shut down. Thank you for playing!');
  const ch = await client.channels.fetch(config.ssuShutdownChannelId);
  await ch.send({ embeds:[embed] });
  setHost(null);
  setSessionStatus(client, 'offline').catch(()=>{});
  return '✅ Shutdown message sent. Status set to OFFLINE.';
}

async function runChangehost(args, client) {
  const newHost = await client.users.fetch(args.host);
  const ch = await client.channels.fetch(config.ssuStartupChannelId);
  await ch.send(`The new host is <@${newHost.id}>`);
  setHost(newHost.id);
  return `✅ Announced ${newHost.username} as the new host.`;
}

async function runServerpoll(args, client) {
  const options = (args.options ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const desc = `**${args.title}**\n\n` + options.map((o,i) => `${['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'][i]??`${i+1}.`} ${o}`).join('\n');
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('📊 Server Poll').setDescription(desc);
  const ch = await client.channels.fetch(config.ssuPollChannelId);
  await ch.send({ embeds:[embed] });
  return `✅ Poll posted: "${args.title}"`;
}

// ─── server controls ─────────────────────────────────────────────────────────

async function runChannellock(args, client) {
  const ch = await client.channels.fetch(args.channel);
  await ch.permissionOverwrites.edit(ch.guild.roles.everyone, { SendMessages:false });
  return `🔒 #${ch.name} has been locked.`;
}

async function runChannelunlock(args, client) {
  const ch = await client.channels.fetch(args.channel);
  await ch.permissionOverwrites.edit(ch.guild.roles.everyone, { SendMessages:null });
  return `🔓 #${ch.name} has been unlocked.`;
}

async function runServerlock(args, client) {
  const guild = await client.guilds.fetch(config.mainGuildId);
  const channels = guild.channels.cache.filter(c => c.type === 0);
  let count = 0;
  for (const [,ch] of channels) {
    await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages:false }).catch(()=>{});
    count++;
  }
  return `🔒 Server locked. ${count} text channels locked. Reason: ${args.reason}`;
}

async function runServerunlock(args, client) {
  const guild = await client.guilds.fetch(config.mainGuildId);
  const channels = guild.channels.cache.filter(c => c.type === 0);
  let count = 0;
  for (const [,ch] of channels) {
    await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages:null }).catch(()=>{});
    count++;
  }
  return `🔓 Server unlocked. ${count} text channels unlocked.`;
}

// ─── other commands ──────────────────────────────────────────────────────────

async function runStaffblacklist(args, client) {
  const guild = await client.guilds.fetch(config.mainGuildId);
  const member = await guild.members.fetch(args.user);
  if (args.action === 'add') {
    await member.roles.add(config.staffBlacklistRoleId);
    return `✅ Staff blacklisted ${member.user.username}.`;
  } else {
    await member.roles.remove(config.staffBlacklistRoleId);
    return `✅ Removed staff blacklist from ${member.user.username}.`;
  }
}

async function runSetpingwarn(args, client) {
  const target = await fetchTarget(args.user, client);
  setProtected(target.id, {
    enabled:   true,
    threshold: parseInt(args.threshold) || 5,
    autoWarn:  args.autowarn === 'true',
    decayDays: 7,
    pingers:   {},
  });
  return `✅ Ping protection enabled for ${target.username}. Threshold: ${args.threshold}. Auto-warn: ${args.autowarn === 'true' ? 'Yes' : 'No'}.`;
}

async function runPingwarnoff(args, client) {
  const target = await fetchTarget(args.user, client);
  const entry = getProtected(target.id);
  if (entry) setProtected(target.id, { ...entry, enabled: false });
  return `✅ Ping protection disabled for ${target.username}.`;
}

async function runPingwarnreset(args, client) {
  const target = await fetchTarget(args.user, client);
  const entry = getProtected(target.id);
  if (entry) setProtected(target.id, { ...entry, pingers: {} });
  return `✅ Ping counters reset for ${target.username}.`;
}

async function runPurgemessages(args, client) {
  const ch     = await client.channels.fetch(args.channel);
  const amount = Math.min(100, Math.max(1, parseInt(args.amount)||1));
  const deleted = await ch.bulkDelete(amount, true);
  return `🗑️ Purged ${deleted.size} messages from #${ch.name}.`;
}

async function runAppealsend(args, client) {
  const staffHub = await client.guilds.fetch(config.staffHubGuildId);
  const forum    = await staffHub.channels.fetch(config.modLogsForumId);
  if (!forum?.isThreadOnly()) throw new Error('Could not find the mod logs forum.');

  const caseNum = parseInt(args.case);
  let thread = null;
  const active = await forum.threads.fetchActive();
  thread = active.threads.find(t => t.name.startsWith(`Case #${caseNum} —`) || t.name.startsWith(`Case #${caseNum} -`));
  if (!thread) {
    const archived = await forum.threads.fetchArchived({ limit:100 });
    thread = archived.threads.find(t => t.name.startsWith(`Case #${caseNum} —`) || t.name.startsWith(`Case #${caseNum} -`));
  }
  if (!thread) throw new Error(`Could not find a forum post for Case #${caseNum}.`);

  const appealedTag = forum.availableTags.find(t => t.name === 'Appealed');
  if (appealedTag) {
    const current = thread.appliedTags.filter(id => id !== appealedTag.id);
    await thread.setAppliedTags([...current, appealedTag.id]);
  }
  const embed = new EmbedBuilder()
    .setTitle(`✅ Appeal Processed — Case #${caseNum}`)
    .setColor(0x57F287)
    .addFields(
      { name:'Processed by', value:'Dashboard', inline:true },
      { name:'Timestamp',    value:`<t:${Math.floor(Date.now()/1000)}:F>`, inline:true },
    );
  if (args.notes) embed.addFields({ name:'Notes', value:args.notes, inline:false });
  await thread.send({ embeds:[embed] });
  return `✅ Appeal processed for Case #${caseNum}.`;
}

// ─── main dispatcher ─────────────────────────────────────────────────────────

async function executeCommand(cmdName, args, requesterId, client) {
  const MOD_CMDS = ['warn','mute','timeout','unmute','kick','ban'];
  const RBX_CMDS = Object.keys(RBX_ACTION_MAP);

  if (MOD_CMDS.includes(cmdName)) return runModAction(cmdName, args, requesterId, client);
  if (RBX_CMDS.includes(cmdName)) return runRbxAction(cmdName, args, requesterId, client);

  switch (cmdName) {
    case 'punishlogs':     return runPunishlogs(args);
    case 'shiftcheck':     return runShiftcheck({ ...args, requested_by: requesterId });
    case 'shiftleaderboard': return runShiftleaderboard();
    case 'quotacheck':     return runQuotacheck();

    case 'systemtoggle': {
      const on = args.enabled === 'true' || args.enabled === true;
      setEnabled(args.system, on);
      const labels = { permrequest:'Perm Request Format', ssu:'SSU System', shift:'Shift Tracking', pingwarn:'Ping Warn' };
      return `✅ ${labels[args.system] ?? args.system} turned ${on ? '🟢 ON' : '🔴 OFF'}.`;
    }

    case 'ssumessage':    return runSsumessage(args, client);
    case 'ssdmessage':    return runSsdmessage(client);
    case 'changehost':    return runChangehost(args, client);
    case 'serverpoll':    return runServerpoll(args, client);

    case 'channellock':   return runChannellock(args, client);
    case 'channelunlock': return runChannelunlock(args, client);
    case 'serverlock':    return runServerlock(args, client);
    case 'serverunlock':  return runServerunlock(args, client);

    case 'staffblacklist':  return runStaffblacklist(args, client);
    case 'setpingwarn':     return runSetpingwarn(args, client);
    case 'pingwarnoff':     return runPingwarnoff(args, client);
    case 'pingwarnreset':   return runPingwarnreset(args, client);
    case 'purgemessages':   return runPurgemessages(args, client);
    case 'appealsend':      return runAppealsend(args, client);

    default: throw new Error(`Unknown command: ${cmdName}`);
  }
}

module.exports = { executeCommand };
