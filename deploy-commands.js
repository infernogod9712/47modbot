// Run once after adding/changing slash commands:
//   node deploy-commands.js
// Registers commands globally (works in all servers — takes up to 1 hour to propagate).

const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const commands = [];
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
  try {
    console.log(`Registering ${commands.length} slash commands globally...`);
    await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
    console.log('Done! Commands registered. May take up to 1 hour to appear in all servers.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
})();
