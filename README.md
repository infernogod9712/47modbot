# 47ModBot — S47 Moderation Manager

Unified moderation bot for Site-47. Handles Discord moderation, Roblox game logging, shift tracking, and server management across the S47 server network.

Every punishment is:
1. Executed on the user in Discord (where applicable)
2. Logged to a Google Sheet with a global sequential Case ID
3. Posted as a forum thread in `#mod-moderation-logs` in the staff hub

---

## Commands

### Discord Moderation
| Command | Description |
|---------|-------------|
| `/warn @user reason` | Issue a formal warning (log only) |
| `/kick @user reason` | Kick a user |
| `/ban @user reason` | Ban a user |
| `/timeout @user duration reason` | Timeout a user (e.g. `10m`, `2h`, `7d`) |
| `/mute @user reason` | Permanently mute via role |
| `/unmute @user reason` | Remove mute role |
| `/purgemessages amount reason` | Bulk delete messages (1–100), logs to forum |
| `/punishlogs @user` | Paginated punishment history (Discord + Roblox) |

### Roblox Logging *(logging only — no in-game actions)*
| Command | Description |
|---------|-------------|
| `/rbxverbalwarn ru reason proof` | Log a verbal warning |
| `/rbxwarn ru reason proof` | Log a warning |
| `/rbxmute ru reason proof` | Log a mute |
| `/rbxkick ru reason proof` | Log a kick |
| `/rbxban ru reason appealable proof` | Log a ban |
| `/rbxblacklist ru reason appealable proof` | Log an in-game blacklist |
| `/rbxglobalblacklist ru reason appealable proof` | Log a global blacklist |

### Shift Log System *(Staff Hub only)*
| Command | Description |
|---------|-------------|
| `/shiftstart` | Start your moderation shift |
| `/shiftend` | End your shift — logs duration and quota status |
| `/shiftcheck` | View your current shift and weekly total |
| `/shiftleaderboard` | Weekly top 10 (resets every Monday) |
| `/quotacheck` | *(Admin)* Quota status for all staff |
| `/settime @user time` | *(Admin)* Manually add shift time |

**Quota tiers:** ❌ Failed (0) · ⚠️ Partially Passed (1m–2h59m) · ✅ Passed (3h–4h59m) · ⭐ Excellent (5h+)

Auto-posts quota check every **Sunday 6:00 PM EST**. Bot DMs you after **3 hours** on shift with an Adjust Time button.

### Server Management
| Command | Description |
|---------|-------------|
| `/channellock` | Lock current channel for @everyone |
| `/channelunlock` | Unlock current channel |
| `/serverlock` | Disable @everyone send messages server-wide *(Admin)* |
| `/serverunlock` | Re-enable @everyone send messages *(Admin)* |
| `/botlockdown` | Block all commands with lockdown message *(Admin)* |
| `/botunlock` | Release bot lockdown *(Admin)* |
| `/staffblacklist @user reason proof` | Log, kick from hub, add blacklist role *(Admin)* |
| `/findid @user` | Get a user's Discord ID |

### Permissions & Whitelist
| Command | Description |
|---------|-------------|
| `/setpermission add/remove @role` | Set which roles can use mod commands |
| `/whitelist add/remove user/role` | Protect users from being punished |

### SSU System
| Command | Description |
|---------|-------------|
| `/serverpoll` | Start a session startup poll |
| `/ssumessage` | Send a session startup message |
| `/ssdmessage` | Send a session shutdown message |

### Public
| Command | Description |
|---------|-------------|
| `/ping` | Check bot latency |
| `/larp` | LARP command |
| `/glaze` | Glaze command |

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

## Setup

1. Copy `config.example.js` → `config.js` and fill in all values
2. Add `credentials.json` (Google service account key with Sheets API access)
3. `npm install`
4. `node deploy-commands.js` — register slash commands with Discord
5. `node index.js` — start the bot

---

## Hosting

Hosted on [bot-hosting.net](https://bot-hosting.net) via Pterodactyl.  
Upload all files except `config.js`, `credentials.json`, and `node_modules/`.

---

## File Structure

```
47modbot/
├── index.js                  Main entry point + interaction router
├── deploy-commands.js        Run once to register slash commands
├── config.js                 Bot config (gitignored)
├── credentials.json          Google service account key (gitignored)
├── package.json
├── commands/
│   ├── warn.js / kick.js / ban.js / timeout.js / mute.js / unmute.js
│   ├── purgemessages.js
│   ├── punishlogs.js
│   ├── rbxverbalwarn.js / rbxwarn.js / rbxmute.js / rbxkick.js
│   ├── rbxban.js / rbxblacklist.js / rbxglobalblacklist.js
│   ├── shiftstart.js / shiftend.js / shiftcheck.js
│   ├── shiftleaderboard.js / quotacheck.js / settime.js
│   ├── channellock.js / channelunlock.js
│   ├── serverlock.js / serverunlock.js
│   ├── botlockdown.js / botunlock.js
│   ├── staffblacklist.js / findid.js
│   ├── setpermission.js / whitelist.js
│   └── serverpoll.js / ssumessage.js / ssdmessage.js / ping.js / larp.js / glaze.js
└── handlers/
    ├── modAction.js          Discord punishment handler
    ├── rbxAction.js          Roblox punishment handler
    ├── shiftAction.js        Shift system logic + reminders
    ├── sheets.js             Google Sheets API wrapper
    ├── permissions.js        Role/whitelist management
    ├── lockdown.js           Bot lockdown flag
    ├── prefixHandler.js      m! prefix commands
    └── ssu.js                Session start/shutdown logic
```
