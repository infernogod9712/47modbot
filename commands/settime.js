const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { logShiftHistory } = require('../handlers/sheets');
const { parseDurationInput, formatDuration, getISOWeek } = require('../handlers/shiftAction');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('settime')
    .setDescription('Manually add shift time for a staff member (Admin only)')
    .addUserOption(opt =>
      opt.setName('user').setDescription('Staff member to adjust').setRequired(true))
    .addStringOption(opt =>
      opt.setName('time').setDescription('Time to add (e.g. 3h, 2h30m, 90m)').setRequired(true))
    .addStringOption(opt =>
      opt.setName('note').setDescription('Reason for the adjustment').setRequired(false)),

  async execute(interaction) {
    if (interaction.guildId !== config.staffHubGuildId) {
      return interaction.reply({ content: '❌ Shift commands can only be used in the staff hub.', ephemeral: true });
    }
    if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const target      = interaction.options.getUser('user');
    const timeStr     = interaction.options.getString('time');
    const noteInput   = interaction.options.getString('note') ?? '';
    const durationMs  = parseDurationInput(timeStr);

    if (!durationMs) {
      return interaction.editReply({ content: '❌ Invalid time format. Use formats like `3h`, `2h30m`, `90m`.' });
    }

    const { week, year } = getISOWeek();
    const now = new Date().toISOString();
    await logShiftHistory({
      userId:    target.id,
      username:  target.username,
      startTime: now,
      endTime:   now,
      durationMs,
      weekNum:   week,
      year,
      note:      noteInput || `Manual adjustment by ${interaction.user.username}`,
    });

    const embed = new EmbedBuilder()
      .setTitle('✅ Time Added')
      .setColor(0x57F287)
      .addFields(
        { name: 'User',    value: `<@${target.id}>`,         inline: true },
        { name: 'Added',   value: formatDuration(durationMs), inline: true },
        { name: 'Week',    value: `Week ${week} of ${year}`,  inline: true },
      );
    if (noteInput) embed.addFields({ name: 'Note', value: noteInput, inline: false });

    await interaction.editReply({ embeds: [embed] });
  },
};
