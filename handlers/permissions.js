const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../data/guild_permissions.json');

function load() {
  if (!fs.existsSync(FILE)) return {};
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function getRoles(guildId) {
  return load()[guildId] || [];
}

function addRole(guildId, roleId) {
  const data = load();
  if (!data[guildId]) data[guildId] = [];
  if (!data[guildId].includes(roleId)) data[guildId].push(roleId);
  save(data);
}

function removeRole(guildId, roleId) {
  const data = load();
  if (!data[guildId]) return;
  data[guildId] = data[guildId].filter(id => id !== roleId);
  save(data);
}

module.exports = { getRoles, addRole, removeRole };
