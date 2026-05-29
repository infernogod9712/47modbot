const { google } = require('googleapis');
const config = require('../config');

let authClient;

async function getAuth() {
  if (authClient) return authClient;
  const auth = new google.auth.GoogleAuth({
    keyFile: './credentials.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  authClient = await auth.getClient();
  return authClient;
}

async function getNextCaseId() {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const [discordRes, rbxRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: config.googleSheetId, range: 'Logs!A:A' }),
    sheets.spreadsheets.values.get({ spreadsheetId: config.googleSheetId, range: 'Roblox Logs!A:A' })
      .catch(() => ({ data: { values: [] } })),
  ]);

  const allIds = [
    ...(discordRes.data.values || []).slice(1),
    ...(rbxRes.data.values   || []).slice(1),
  ].map(row => parseInt(row[0])).filter(n => !isNaN(n));

  return allIds.length ? Math.max(...allIds) + 1 : 1;
}

async function logAction({ caseId, timestamp, server, action, user, userId, mod, modId, reason }) {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: 'Logs!A:I',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[caseId, timestamp, server, action, user, userId, mod, modId, reason]],
    },
  });
}

async function logRbxAction({ caseId, timestamp, action, ru, du, duName, mod, modId, reason, proof }) {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: 'Roblox Logs!A:J',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[caseId, timestamp, action, ru, du, duName, mod, modId, reason, proof]],
    },
  });
}

async function getLogsForUser(userId) {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: 'Logs!A:I',
  });
  const rows = res.data.values || [];
  return rows.slice(1).filter(row => row[5] === userId);
}

async function getRbxLogsForUser(userId) {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: 'Roblox Logs!A:J',
  });
  const rows = res.data.values || [];
  // Filter by DU ID (column E, index 4)
  return rows.slice(1).filter(row => row[4] === userId);
}

// Returns merged + sorted (newest first) normalized rows from both tabs
async function fetchAllLogsForUser(userId) {
  const [discordRows, rbxRows] = await Promise.all([
    getLogsForUser(userId),
    getRbxLogsForUser(userId).catch(() => []),
  ]);

  const normalized = [
    ...discordRows.map(r => ({
      caseId:    parseInt(r[0]) || 0,
      timestamp: r[1] || '',
      action:    r[3] || '',
      subject:   r[4] || '',
      mod:       r[6] || '',
      reason:    r[8] || '',
      source:    'discord',
    })),
    ...rbxRows.map(r => ({
      caseId:    parseInt(r[0]) || 0,
      timestamp: r[1] || '',
      action:    r[2] || '',
      subject:   r[3] || '',  // RU
      mod:       r[6] || '',
      reason:    r[8] || '',
      source:    'roblox',
    })),
  ];

  return normalized.sort((a, b) => b.caseId - a.caseId);
}

// ─── Shift System ────────────────────────────────────────────────────────────

const sheetIdCache = {};

async function _getSheetId(sheetName) {
  if (sheetIdCache[sheetName] !== undefined) return sheetIdCache[sheetName];
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.get({ spreadsheetId: config.googleSheetId });
  for (const s of res.data.sheets) sheetIdCache[s.properties.title] = s.properties.sheetId;
  return sheetIdCache[sheetName];
}

async function startShift(userId, username, startTime) {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: 'Active Shifts!A:E',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[userId, username, startTime, 'FALSE', '']] },
  });
}

async function getActiveShift(userId) {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: 'Active Shifts!A:E',
  });
  const rows = (res.data.values || []).slice(1); // skip header
  const idx = rows.findIndex(r => r[0] === userId);
  if (idx === -1) return null;
  return { row: rows[idx], rowIndex: idx + 1 }; // +1 to account for header
}

async function getAllActiveShifts() {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: 'Active Shifts!A:E',
  });
  return (res.data.values || []).slice(1).filter(r => r[0]); // skip header
}

async function markReminderSent(userId) {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: 'Active Shifts!A:A',
  });
  const rows = (res.data.values || []).slice(1); // skip header
  const idx = rows.findIndex(r => r[0] === userId);
  if (idx === -1) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.googleSheetId,
    range: `Active Shifts!D${idx + 2}`, // +2: 1 for header, 1 for 1-based
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['TRUE']] },
  });
}

async function setTimeOverride(userId, durationMs) {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: 'Active Shifts!A:A',
  });
  const rows = (res.data.values || []).slice(1); // skip header
  const idx = rows.findIndex(r => r[0] === userId);
  if (idx === -1) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.googleSheetId,
    range: `Active Shifts!E${idx + 2}`, // +2: 1 for header, 1 for 1-based
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[durationMs.toString()]] },
  });
}

async function endShift(userId) {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: 'Active Shifts!A:E',
  });
  const rows = (res.data.values || []).slice(1); // skip header
  const idx = rows.findIndex(r => r[0] === userId);
  if (idx === -1) return null;

  const [, , startTime, , overrideRaw] = rows[idx];
  const timeOverrideMs = overrideRaw ? parseInt(overrideRaw) : null;

  const sheetId = await _getSheetId('Active Shifts');
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: config.googleSheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: idx + 1, endIndex: idx + 2 },
        },
      }],
    },
  });

  return { startTime, timeOverrideMs };
}

async function logShiftHistory({ userId, username, startTime, endTime, durationMs, weekNum, year, note }) {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetId,
    range: 'Shift History!A:H',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[userId, username, startTime, endTime, durationMs, weekNum, year, note || '']],
    },
  });
}

async function getWeeklyShiftData(weekNum, year) {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: 'Shift History!A:H',
  });
  const rows = res.data.values || [];
  return rows.slice(1).filter(r => parseInt(r[5]) === weekNum && parseInt(r[6]) === year);
}

module.exports = {
  getNextCaseId,
  logAction,
  logRbxAction,
  getLogsForUser,
  getRbxLogsForUser,
  fetchAllLogsForUser,
  startShift,
  getActiveShift,
  getAllActiveShifts,
  markReminderSent,
  setTimeOverride,
  endShift,
  logShiftHistory,
  getWeeklyShiftData,
};
