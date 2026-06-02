const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../data/system_toggles.json');

const DEFAULTS = {
  permrequest: true,
  ssu:         true,
  shift:       true,
  pingwarn:    true,
};

function load() {
  if (!fs.existsSync(FILE)) return { ...DEFAULTS };
  try {
    const content = fs.readFileSync(FILE, 'utf8').trim();
    return content ? { ...DEFAULTS, ...JSON.parse(content) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function isEnabled(system) {
  const data = load();
  return data[system] !== false;
}

function setEnabled(system, value) {
  const data = load();
  data[system] = value;
  save(data);
}

function getAll() {
  return load();
}

module.exports = { isEnabled, setEnabled, getAll };
