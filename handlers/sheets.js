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
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: 'Logs!A:A',
  });
  const rows = res.data.values || [];
  // Row 1 is the header, so next case = total rows (header counts as row 1)
  return rows.length;
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

async function getLogsForUser(userId) {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetId,
    range: 'Logs!A:I',
  });
  const rows = res.data.values || [];
  // Row 0 is header, filter by User ID (column F = index 5)
  return rows.slice(1).filter(row => row[5] === userId);
}

module.exports = { getNextCaseId, logAction, getLogsForUser };
