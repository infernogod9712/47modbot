const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function getISOWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return {
    week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7),
    year: d.getUTCFullYear(),
  };
}

function parseDurationInput(str) {
  let ms = 0;
  const h = str.match(/(\d+)\s*h/i);
  const m = str.match(/(\d+)\s*m/i);
  const s = str.match(/(\d+)\s*s/i);
  if (h) ms += parseInt(h[1]) * 3_600_000;
  if (m) ms += parseInt(m[1]) * 60_000;
  if (s) ms += parseInt(s[1]) * 1_000;
  return ms > 0 ? ms : null;
}

function formatDuration(ms) {
  if (ms <= 0) return '0m';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!h && !m && s) parts.push(`${s}s`);
  return parts.join(' ') || '0m';
}

function getQuotaTier(ms) {
  const min1 = 60_000;
  const h3   = 3 * 3_600_000;
  const h5   = 5 * 3_600_000;
  if (ms < min1) return { label: 'Failed',           emoji: '❌', color: 0xFF0000 };
  if (ms < h3)   return { label: 'Partially Passed', emoji: '⚠️', color: 0xFFA500 };
  if (ms < h5)   return { label: 'Passed',           emoji: '✅', color: 0x57F287 };
  return         { label: 'Excellent',               emoji: '⭐', color: 0xFFD700 };
}

const pendingReminders = new Map();

function scheduleReminder(client, userId, startTime) {
  const THREE_HOURS = 3 * 60 * 60 * 1000;
  const elapsed = Date.now() - new Date(startTime).getTime();
  const delay = Math.max(THREE_HOURS - elapsed, 0);

  if (pendingReminders.has(userId)) clearTimeout(pendingReminders.get(userId));

  const timeout = setTimeout(async () => {
    pendingReminders.delete(userId);
    try {
      const { markReminderSent } = require('./sheets');
      await markReminderSent(userId);

      const user = await client.users.fetch(userId);
      const currentElapsed = Date.now() - new Date(startTime).getTime();

      const embed = new EmbedBuilder()
        .setTitle('⏱️ Shift Reminder')
        .setColor(0x5865F2)
        .setDescription(`You've been on shift for **${formatDuration(currentElapsed)}**. Don't forget to use \`/shiftend\` when you're done!`)
        .addFields({ name: 'Started', value: `<t:${Math.floor(new Date(startTime).getTime() / 1000)}:R>`, inline: true });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`adjusttime_${userId}`)
          .setLabel('Adjust Time')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('✏️'),
      );

      await user.send({ embeds: [embed], components: [row] });
    } catch (err) {
      console.error(`[ShiftReminder] Failed to DM ${userId}:`, err.message);
    }
  }, delay);

  pendingReminders.set(userId, timeout);
}

function cancelReminder(userId) {
  if (pendingReminders.has(userId)) {
    clearTimeout(pendingReminders.get(userId));
    pendingReminders.delete(userId);
  }
}

async function scheduleAllReminders(client) {
  try {
    const { getAllActiveShifts } = require('./sheets');
    const rows = await getAllActiveShifts();
    let count = 0;
    for (const row of rows) {
      if (!row[0] || row[3] === 'TRUE') continue;
      scheduleReminder(client, row[0], row[2]);
      count++;
    }
    console.log(`[ShiftSystem] Scheduled reminders for ${count} active shift(s).`);
  } catch (err) {
    console.error('[ShiftSystem] Failed to schedule reminders on ready:', err.message);
  }
}

module.exports = { getISOWeek, parseDurationInput, formatDuration, getQuotaTier, scheduleReminder, cancelReminder, scheduleAllReminders };
