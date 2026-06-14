# 47ModBot — S47 Unified Moderation Bot

Unified moderation bot for Site-47. Handles Discord moderation, Roblox game logging, shift tracking, SSU session management, ping protection, and server lockdowns across the S47 server network.

Every punishment is:
1. Executed on the user in Discord (where applicable)
2. Logged to a Google Sheet with a global sequential Case ID
3. Posted as a forum thread in the staff hub mod logs forum

---

## Systems Overview

| System | What it does |
|--------|-------------|
| **Discord Moderation** | Warn, mute, timeout, kick, ban with full logging |
| **Roblox Logging** | Log in-game actions to Sheets + forum (no in-game execution) |
| **Shift Tracking** | Clock in/out, weekly quota, leaderboard, auto Sunday report |
| **SSU Session** | Startup/shutdown messages, host tracking, mod request format enforcer |
| **Ping Protection** | Auto-warn users who repeatedly ping protected members |
| **Server Controls** | Channel/server lock, bot lockdown, staff blacklist |
| **Appeals** | Mark punishments as appealed in the mod logs forum |
| **Dashboard** | Web UI showing commands by role (`dashboard/index.html`) |

---

## Commands

### Discord Moderation
| Command | Description | Permission |
|---------|-------------|------------|
| `/warn @user reason` | Issue a formal warning (logged, no action) | Mod |
| `/mute @user reason` | Permanently mute via role | Mod |
| `/unmute @user reason` | Remove mute role | Mod |
| `/timeout @user duration reason` | Temp timeout (e.g. `10m`, `2h`, `7d`) | Mod |
| `/kick @user reason` | Kick a user | Mod |
| `/ban @user reason appealable` | Ban from all S47 servers (skips appeals servers) | Mod |
| `/purgemessages amount reason` | Bulk delete 1–100 messages, logs to forum | Mod |
| `/punishlogs @user` | Paginated punishment history (Discord + Roblox) | Mod |
| `/appealsend case notes` | Mark a case as appealed in the forum post | Mod |

### Roblox Logging *(logging only — no in-game execution)*
| Command | Description | Permission |
|---------|-------------|------------|
| `/rbxverbalwarn ru reason proof` | Log a verbal warning | Mod |
| `/rbxwarn ru reason proof` | Log a warning | Mod |
| `/rbxmute ru reason proof` | Log a mute | Mod |
| `/rbxkick ru reason proof` | Log a kick | Mod |
| `/rbxban ru reason appealable proof` | Log a ban | Mod |
| `/rbxblacklist ru reason appealable proof` | Log an in-game blacklist | Mod |
| `/rbxglobalblacklist ru reason appealable proof` | Log a global game blacklist | Mod |

### Shift Tracking *(Staff Hub only)*
| Command | Description | Permission |
|---------|-------------|------------|
| `/shiftstart` | Start your moderation shift | Staff |
| `/shiftend` | End shift — logs duration and quota status | Staff |
| `/shiftcheck` | View current shift and weekly total | Staff |
| `/shiftleaderboard` | Weekly top 10 (resets every Monday) | Staff |
| `/quotacheck` | Quota status for all staff | Admin |
| `/settime @user time` | Manually set a user's shift duration | Admin |

**Quota tiers:** ❌ Failed (0) · ⚠️ Partial (1m–2h59m) · ✅ Passed (3h–4h59m) · ⭐ Excellent (5h+)

Auto-posts quota check every **Sunday 6:00 PM EST**.
Bot DMs you with an **Adjust Time** button after **3 hours** on shift.

### SSU System *(SSU role or Admin)*
| Command | Description |
|---------|-------------|
| `/serverpoll` | Post a session startup poll in the poll channel |
| `/ssumessage ssuh mode max_players xp_required profile_link` | Send startup embed, ping `@SSU`, set session host |
| `/ssdmessage screenshot` | Send shutdown embed, bulk-clear startup channel, clear session host |
| `/changehost @user` | Announce new session host in startup channel, update session tracking |

**Session host tracking:** `ssumessage` and `changehost` write the host's ID to `session.json`. `ssdmessage` clears it. The active host is used by the mod request format enforcer to auto-ping them.

### Mod Request Format Enforcer *(automatic, no command)*

Watches `#ssu-mod-request` while a session is active. Ignores bots and messages containing `!ignore!`.

**Valid formats:**
```
Department Mod        Faction Mod           Normal Mod / Staff / O5
──────────────────    ──────────────────    ──────────────────
Username:             Username:             Username:
Department:           Faction:              Rank:
Rank:                 Rank:
```

- Wrong format → bot replies with all three formats shown
- Correct format → bot replies pinging the current session host
- No active session → bot does nothing

### Ping Protection *(self-register, Admin/High Command)*
| Command | Description |
|---------|-------------|
| `/setpingwarn enabled threshold auto_warn decay_days` | Enable protection for yourself |
| `/pingwarnoff` | Quickly disable your ping protection |
| `/pingwarnreset @protected @pinger` | Reset a pinger's count (Admin) |

**How it works:**
- **1st ping** → public reply in channel: user does not want to be pinged
- **2nd–(threshold-1) pings** → DM to pinger with count remaining
- **At threshold** → formal auto-warn issued (Case ID assigned) OR mods notified, forum report posted, protected user DM'd, count reset
- Multiple pings of the same user in one message count as **1** ping
- Messages that are **replies** are ignored (reply mentions don't count)
- Only fires in the **main guild** — ignored in other servers
- Mod/admin users are always exempt

### Server & Bot Controls
| Command | Description | Permission |
|---------|-------------|------------|
| `/channellock` | Lock current channel for @everyone | Self-reg |
| `/channelunlock` | Unlock current channel | Self-reg |
| `/serverlock` | Disable @everyone send messages server-wide | Self-reg |
| `/serverunlock` | Re-enable @everyone messaging | Self-reg |
| `/botlockdown` | Block all commands with lockdown message | Self-reg |
| `/botunlock` | Release bot lockdown | Self-reg |
| `/staffblacklist @user reason proof` | Log, kick from hub, add blacklist role | Self-reg |
| `/findid @user` | Return a user's Discord ID | Public |

### Permissions
| Command | Description |
|---------|-------------|
| `/setpermission add/remove @role` | Set which roles can use mod commands |
| `/whitelist add/remove user/role` | Protect users from being punished |

### Public
| Command | Description |
|---------|-------------|
| `/ping` | Check bot latency |
| `/larp` | LARP command |
| `/glaze` | Glaze command |

---

## Permission Groups

| Group | Commands |
|-------|---------|
| **PUBLIC** | `/ping`, `/larp`, `/glaze`, `/findid` |
| **MOD** (set via `/setpermission`) | All punishment, Roblox logging, shift, purge, punishlogs, appealsend commands |
| **SSU** (config `ssuRoleId`) | `/serverpoll`, `/ssumessage`, `/ssdmessage`, `/changehost` |
| **ADMIN** (Discord Administrator) | All of the above + `/quotacheck`, `/settime`, `/staffblacklist` |
| **SELF-REG** (internal permission check) | `/botlockdown`, `/botunlock`, `/channellock`, `/channelunlock`, `/serverlock`, `/serverunlock`, `/staffblacklist`, `/setpingwarn`, `/pingwarnoff`, `/pingwarnreset` |

---

## Google Sheets Structure

Single spreadsheet with four tabs:

| Tab | Columns |
|-----|---------|
| `Logs` | Case ID · Timestamp · Server · Action · User · User ID · Mod · Mod ID · Reason |
| `Roblox Logs` | Case ID · Timestamp · Action · RU · DU ID · DU Name · Mod · Mod ID · Reason · Proof |
| `Active Shifts` | UserID · Username · StartTime · ReminderSent · TimeOverrideMs |
| `Shift History` | UserID · Username · StartTime · EndTime · DurationMs · WeekNum · Year · Note |

---

## Persistent Data Files

| File | Purpose |
|------|---------|
| `session.json` | Active session host ID — written by `/ssumessage` and `/changehost`, cleared by `/ssdmessage` |
| `ping_warns.json` | Ping protection config and per-pinger counters per protected user |
| `permissions.json` | Role IDs allowed to use mod commands (set via `/setpermission`) |
| `whitelist.json` | Users/roles exempt from being punished |
| `lockdown.json` | Bot lockdown flag |

---

## Web Dashboard

Located at `dashboard/index.html`. Deploy to Netlify (drag and drop — single file, no build step).

**Loading animation:**
1. Two edge lines draw from bottom-center around the screen to top-center
2. Single horizontal line appears at screen center
3. "47 BOT COMMAND CENTER" text rises up from that line

**Role tabs** (click to switch view):
- **Administrator** — all panels
- **Moderator** — Punishments, Logs, Roblox Actions, Shift Tracking
- **SSU Team** — Session Controls only
- **Member** — no access

All command buttons are interactive (hover glow, scale effect). Command execution is not yet wired — full backend integration planned via Supabase queue.

---

## Setup

1. Copy `config.example.js` → `config.js` and fill in all values
2. Add `credentials.json` (Google service account key with Sheets API access)
3. `npm install`
4. `node deploy-commands.js` — register slash commands with Discord
5. Create `session.json` with contents `{}` and `ping_warns.json` with contents `{}`
6. `node index.js` — start the bot

---

## Hosting

Hosted on [bot-hosting.net](https://bot-hosting.net) via Pterodactyl.
Upload all files **except** `config.js`, `credentials.json`, and `node_modules/`.

---

## File Structure

```
47modbot/
├── index.js                   Main entry point, interaction router, message handlers
├── deploy-commands.js         Run once to register slash commands
├── config.js                  Bot config (gitignored)
├── credentials.json           Google service account key (gitignored)
├── session.json               Active session host (gitignored — create manually on host)
├── ping_warns.json            Ping protection data (gitignored — create manually on host)
├── package.json
│
├── commands/
│   ├── warn.js                Formal Discord warning
│   ├── mute.js / unmute.js    Mute role management
│   ├── timeout.js             Discord timeout
│   ├── kick.js / ban.js       Kick and ban from all S47 servers (appeals servers exempt)
│   ├── purgemessages.js       Bulk message deletion
│   ├── punishlogs.js          Paginated punishment history
│   ├── appealsend.js          Mark a case as appealed in forum
│   ├── rbxverbalwarn.js       Roblox verbal warning log
│   ├── rbxwarn.js             Roblox warning log
│   ├── rbxmute.js             Roblox mute log
│   ├── rbxkick.js             Roblox kick log
│   ├── rbxban.js              Roblox ban log
│   ├── rbxblacklist.js        Roblox blacklist log
│   ├── rbxglobalblacklist.js  Roblox global blacklist log
│   ├── shiftstart.js          Clock in
│   ├── shiftend.js            Clock out + quota log
│   ├── shiftcheck.js          Current shift status
│   ├── shiftleaderboard.js    Weekly top 10
│   ├── quotacheck.js          All-staff quota view
│   ├── settime.js             Override a user's shift duration
│   ├── serverpoll.js          SSU startup poll
│   ├── ssumessage.js          Session startup embed + host tracking
│   ├── ssdmessage.js          Session shutdown embed + channel clear + host clear
│   ├── changehost.js          Announce new host + update session tracking
│   ├── botlockdown.js         Lock all bot commands
│   ├── botunlock.js           Unlock bot
│   ├── channellock.js         Lock a channel
│   ├── channelunlock.js       Unlock a channel
│   ├── serverlock.js          Server-wide message lock
│   ├── serverunlock.js        Server-wide message unlock
│   ├── staffblacklist.js      Discord staff blacklist
│   ├── setpingwarn.js         Configure ping protection
│   ├── pingwarnoff.js         Quickly disable ping protection
│   ├── pingwarnreset.js       Reset ping counters
│   ├── setpermission.js       Manage mod role whitelist
│   ├── whitelist.js           Manage punishment exemptions
│   ├── findid.js              Look up a Discord user ID
│   ├── ping.js                Latency check
│   ├── larp.js                LARP command
│   └── glaze.js               Glaze command
│
├── handlers/
│   ├── modAction.js           Core Discord punishment logic (DM, execute, log, forum post)
│   ├── rbxAction.js           Roblox logging logic
│   ├── shiftAction.js         Shift timers, reminders, ISO week calc, duration formatting
│   ├── sheets.js              Google Sheets API wrapper (Case IDs, log reads/writes)
│   ├── permissions.js         Role allowlist read/write
│   ├── lockdown.js            Bot lockdown flag (in-memory + file)
│   ├── pingWarn.js            Ping protection data — getProtected, incrementPinger, resetPinger
│   ├── session.js             Session host tracking — getHost, setHost (reads/writes session.json)
│   ├── prefixHandler.js       m! prefix command handler
│   └── ssu.js                 SSU status channel updates, embeds
│
└── dashboard/
    └── index.html             Web dashboard (Netlify — single file, no build step)
```

---

## Message Handlers (in `index.js`)

Three handlers fire on every `messageCreate` event in order:

| Handler | Trigger | Action |
|---------|---------|--------|
| `handlePrefixCommand` | Any message starting with `m!` | Routes to prefix commands |
| `handlePingWarn` | Any non-bot, non-reply message with mentions in main guild | Checks if mentioned users are ping-protected |
| `handlePermReqFormat` | Any message in `#ssu-mod-request` | Validates format, pings host or replies with format guide |
