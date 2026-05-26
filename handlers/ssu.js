const { EmbedBuilder } = require('discord.js');
const config = require('../config');

const STATUS_NAMES = {
  offline:   'Session Status: 🔴 OFFLINE 🔴',
  settingup: 'Session Status: 🟠 SETTING UP 🟠',
  online:    'Session Status: 🟢 ONLINE 🟢',
};

async function setSessionStatus(client, status) {
  const channel = await client.channels.fetch(config.ssuStatusVoiceId);
  await channel.setName(STATUS_NAMES[status]);
}

function buildSettingUpEmbed() {
  return new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle('【 SETTING UP! 】')
    .setDescription(
      '─────────────────────────────\n' +
      'The SSUHT is currently setting up the server.\n' +
      'Please be patient and get ready!\n\n' +
      `Go to <#${config.ssuModRequestId}> and <#${config.ssuMorphRequestId}> to submit your requests.\n` +
      'Remember to follow format or your request will be ignored.'
    );
}

module.exports = { setSessionStatus, buildSettingUpEmbed };
