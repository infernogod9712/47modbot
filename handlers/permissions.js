const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../data/guild_permissions.json');

function load() {
  if (!fs.existsSync(FILE)) return {};
  try {
    const content = fs.readFileSync(FILE, 'utf8').trim();
    return content ? JSON.parse(content) : {};
  } catch {
    return {};
  }
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// Migrate old array format to new object format
function getGuild(data, guildId) {
  if (!data[guildId]) data[guildId] = { allowedRoles: [], whitelist: { users: [], roles: [] } };
  if (Array.isArray(data[guildId])) {
    data[guildId] = { allowedRoles: data[guildId], whitelist: { users: [], roles: [] } };
  }
  if (!data[guildId].whitelist) data[guildId].whitelist = { users: [], roles: [] };
  return data[guildId];
}

// --- Allowed roles (setpermission) ---
function getRoles(guildId) {
  const data = load();
  return getGuild(data, guildId).allowedRoles;
}

function addRole(guildId, roleId) {
  const data = load();
  const guild = getGuild(data, guildId);
  if (!guild.allowedRoles.includes(roleId)) guild.allowedRoles.push(roleId);
  save(data);
}

function removeRole(guildId, roleId) {
  const data = load();
  const guild = getGuild(data, guildId);
  guild.allowedRoles = guild.allowedRoles.filter(id => id !== roleId);
  save(data);
}

// --- Whitelist ---
function addToWhitelist(guildId, type, id) {
  const data = load();
  const guild = getGuild(data, guildId);
  if (!guild.whitelist[type].includes(id)) guild.whitelist[type].push(id);
  save(data);
}

function removeFromWhitelist(guildId, type, id) {
  const data = load();
  const guild = getGuild(data, guildId);
  guild.whitelist[type] = guild.whitelist[type].filter(x => x !== id);
  save(data);
}

function getWhitelist(guildId) {
  const data = load();
  return getGuild(data, guildId).whitelist;
}

async function isWhitelisted(guild, userId) {
  const wl = getWhitelist(guild.id);
  if (wl.users.includes(userId)) return true;
  if (wl.roles.length === 0) return false;
  try {
    const member = await guild.members.fetch(userId);
    return member.roles.cache.some(r => wl.roles.includes(r.id));
  } catch {
    return false;
  }
}

module.exports = { getRoles, addRole, removeRole, addToWhitelist, removeFromWhitelist, getWhitelist, isWhitelisted };
