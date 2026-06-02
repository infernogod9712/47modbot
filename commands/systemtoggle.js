const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { setEnabled, getAll } = require('../handlers/systemToggle');

const SYSTEM_LABELS = {
  permrequest: 'Perm Request Format',
  ssu:         'SSU System',
  shift:       'Shift Tracking',
  pingwarn:    'Ping Warn',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('systemtoggle')
    .setDescription('Enable or disable a bot system (admin only)')
    .addStringOption(opt =>
      opt.setName('system')
        .setDescription('Which system to toggle')
        .setRequired(true)
        .addChoices(
          { name: 'Perm Request Format', value: 'permrequest' },
          { name: 'SSU System',          value: 'ssu'         },
          { name: 'Shift Tracking',      value: 'shift'       },
          { name: 'Ping Warn',           value: 'pingwarn'    },
        ))
    .addBooleanOption(opt =>
      opt.setName('enabled')
        .setDescription('Turn it on or off')
        .setRequired(true)),

  async execute(interaction) {
    const system  = interaction.options.getString('system');
    const enabled = interaction.options.getBoolean('enabled');

    setEnabled(system, enabled);

    const all = getAll();
    const statusLines = Object.entries(SYSTEM_LABELS)
      .map(([key, label]) => `${all[key] !== false ? '🟢' : '🔴'} ${label}`)
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle('⚙️ System Toggle')
      .setColor(enabled ? 0x00ffaa : 0xff4466)
      .addFields(
        { name: 'System',  value: SYSTEM_LABELS[system],    inline: true },
        { name: 'Status',  value: enabled ? '🟢 ON' : '🔴 OFF', inline: true },
        { name: 'Toggled by', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'All Systems', value: statusLines, inline: false },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
