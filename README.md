# 47ModBot

Unified moderation bot for S47. Works across all S47 servers. Every mod action is:
1. Executed on the user in Discord
2. Logged to a Google Sheet with a global sequential Case ID
3. Posted as a forum thread in `#mod-moderation-logs` in the staff hub

## Commands

| Command | Description | Required Permission |
|---|---|---|
| `/kick [user] [reason]` | Kick a user | Kick Members |
| `/ban [user] [reason]` | Ban a user | Ban Members |
| `/timeout [user] [duration] [reason]` | Temporarily mute (max 28d) | Moderate Members |
| `/mute [user] [reason]` | Permanently mute via role | Moderate Members |
| `/unmute [user] [reason]` | Remove mute role | Moderate Members |
| `/warn [user] [reason]` | Issue a formal warning (log only) | Moderate Members |

Every command requires a reason — blank reasons are not accepted.

Duration format for `/timeout`: `10m`, `2h`, `1d`, `7d`, etc. (s/m/h/d)

## Google Sheet structure

The bot appends to a sheet named **Logs** with these columns:

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| Case # | Timestamp | Server | Action | User | User ID | Moderator | Moderator ID | Reason |

Create the sheet with that header row before starting the bot.

## Setup

1. Copy `config.example.js` → `config.js` and fill in all values
2. Add `credentials.json` (Google service account key with Sheets access)
3. Create the forum tags in `#mod-moderation-logs`: `kick`, `ban`, `timeout`, `mute`, `unmute`, `warn`
4. `npm install`
5. `node deploy-commands.js` — register slash commands with Discord
6. `node index.js` — start the bot

## Hosted on bot-hosting.net

Upload all files except `config.js`, `credentials.json`, and `node_modules/`.
Set the start command to `node index.js`.

## File structure

```
47modbot/
├── index.js              Main bot entry point
├── deploy-commands.js    Run once to register slash commands
├── config.example.js     Template — copy to config.js and fill in values
├── package.json
├── commands/             One file per slash command
│   ├── kick.js
│   ├── ban.js
│   ├── timeout.js
│   ├── mute.js
│   ├── unmute.js
│   └── warn.js
└── handlers/
    ├── modAction.js      Core: executes action + logs + creates forum post
    └── sheets.js         Google Sheets API wrapper
```
