const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getProtected, setProtected } = require('../handlers/pingWarn');
const { getRoles } = require('../handlers/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setpingwarn')
    .setDescription('Configure ping protection for yourself (high command only)')
    .addBooleanOption(opt =>
      opt.setName('enabled').setDescription('Enable or disable ping protection').setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('threshold').setDescription('Pings before formal action is taken (default: 3)').setMinValue(1).setMaxValue(10).setRequired(false))
    .addBooleanOption(opt =>
      opt.setName('auto_warn').setDescription('Auto-issue formal warn at threshold? No = notify mods instead (default: Yes)').setRequired(false))
    .addIntegerOption(opt =>
      opt.setName('decay_days').setDescription('Days of inactivity until ping count resets (default: 7, set 0 for never)').setMinValue(0).setMaxValue(30).setRequired(false)),

  async execute(interaction) {
    const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
    const allowedRoles = getRoles(interaction.guild.id);
    const hasRole = interaction.member?.roles?.cache?.some(r => allowedRoles.includes(r.id));

    if (!isAdmin && !hasRole) {
      return interaction.reply({ content: '❌ Only high command members can use ping protection.', ephemeral: true });
    }

    const enabled  = interaction.options.getBoolean('enabled');
    const existing = getProtected(interaction.user.id) ?? {};

    const threshold = interaction.options.getInteger('threshold')   ?? existing.threshold ?? 3;
    const autoWarn  = interaction.options.getBoolean('auto_warn')   ?? (existing.autoWarn !== undefined ? existing.autoWarn : true);
    const decayDays = interaction.options.getInteger('decay_days')  ?? existing.decayDays ?? 7;

    setProtected(interaction.user.id, {
      enabled,
      threshold,
      autoWarn,
      decayDays,
      pingers: existing.pingers ?? {},
    });

    const lines = [
      enabled ? '🛡️ **Ping protection enabled**' : '🔓 **Ping protection disabled**',
      `**Threshold:** ${threshold} ping(s) before formal action`,
      `**Auto-warn:** ${autoWarn ? 'Yes — formal warning issued automatically' : 'No — mods notified instead'}`,
      `**Count decay:** ${decayDays === 0 ? 'Never resets' : `Resets after ${decayDays} day(s) of no pings`}`,
    ];

    await interaction.reply({ content: lines.join('\n'), ephemeral: true });
  },
};
