const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../ping_warns.json');

function load() {
  if (!fs.existsSync(FILE)) return {};
  try {
    const content = fs.readFileSync(FILE, 'utf8').trim();
    return content ? JSON.parse(content) : {};
  } catch { return {}; }
}

function save(data) {
  try {
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[PingWarn] Failed to save ping_warns.json:', err.message);
  }
}

function getProtected(userId) {
  return load()[userId] ?? null;
}

function setProtected(userId, settings) {
  const data = load();
  data[userId] = settings;
  save(data);
}

function incrementPinger(protectedId, pingerId) {
  const data = load();
  if (!data[protectedId]) return 0;
  if (!data[protectedId].pingers) data[protectedId].pingers = {};

  const pinger = data[protectedId].pingers[pingerId] ?? { count: 0, lastPing: 0 };
  const decayDays = data[protectedId].decayDays ?? 7;

  if (decayDays > 0 && pinger.lastPing) {
    const daysSince = (Date.now() - pinger.lastPing) / 86_400_000;
    if (daysSince >= decayDays) pinger.count = 0;
  }

  pinger.count += 1;
  pinger.lastPing = Date.now();
  data[protectedId].pingers[pingerId] = pinger;
  save(data);
  return pinger.count;
}

function resetPinger(protectedId, pingerId) {
  const data = load();
  if (!data[protectedId]?.pingers?.[pingerId]) return false;
  data[protectedId].pingers[pingerId] = { count: 0, lastPing: 0 };
  save(data);
  return true;
}

module.exports = { getProtected, setProtected, incrementPinger, resetPinger, load };
