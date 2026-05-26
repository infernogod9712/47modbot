const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { setSessionStatus } = require('../handlers/ssu');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ssumessage')
    .setDescription('Send a server start up message and set status to ONLINE')
    .addUserOption(opt =>
      opt.setName('ssuh').setDescription('The Session Start Up Host').setRequired(true))
    .addStringOption(opt =>
      opt.setName('mode').setDescription('Server mode').setRequired(true)
        .addChoices(
          { name: 'Serious',      value: 'Serious' },
          { name: 'Semi-Serious', value: 'Semi-Serious' },
        ))
    .addIntegerOption(opt =>
      opt.setName('max_players').setDescription('Max player count').setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('xp_required').setDescription('XP required to join').setRequired(true))
    .addStringOption(opt =>
      opt.setName('profile_link').setDescription("SSUH's Roblox profile link").setRequired(true))
    .addStringOption(opt =>
      opt.setName('server_title').setDescription('Custom server title (optional)').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const ssuh        = interaction.options.getUser('ssuh');
    const mode        = interaction.options.getString('mode');
    const maxPlayers  = interaction.options.getInteger('max_players');
    const xpRequired  = interaction.options.getInteger('xp_required');
    const profileLink = interaction.options.getString('profile_link');
    const customTitle = interaction.options.getString('server_title');

    const serverTitle = customTitle ?? `「Site 47」|「${mode} Roleplay」`;

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('【 SERVER START UP! 】')
      .setDescription(
        '─────────────────────────────\n' +
        `**Server Title:** ${serverTitle}\n` +
        `**SSUH:** <@${ssuh.id}>\n` +
        `**Max Player Count:** ${maxPlayers}\n` +
        `**XP Required:** ${xpRequired}\n` +
        '─────────────────────────────\n' +
        `Go to <#${config.ssuModRequestId}> and <#${config.ssuMorphRequestId}> to request your morph.\n` +
        'Remember to follow format or your request will be ignored.\n\n' +
        "You can go to the SSUH's profile link here if you want to join from there.\n" +
        profileLink
      );

    const startupChannel = await interaction.client.channels.fetch(config.ssuStartupChannelId);
    await startupChannel.send({ embeds: [embed] });

    let statusNote = '';
    try {
      await setSessionStatus(interaction.client, 'online');
    } catch (err) {
      console.error('[ssumessage] Status channel update failed:', err.message);
      statusNote = '\n⚠️ Could not update status channel — check bot permissions.';
    }

    await interaction.editReply({ content: `✅ Start up message sent! Status set to 🟢 ONLINE.${statusNote}` });
  },
};
