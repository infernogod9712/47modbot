const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('staffblacklist')
    .setDescription('Blacklist a staff member — logs, kicks from hub, adds role in main (Admin only)')
    .addUserOption(opt =>
      opt.setName('user').setDescription('Staff member to blacklist').setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason').setDescription('Reason for the blacklist').setRequired(true))
    .addStringOption(opt =>
      opt.setName('proof_link').setDescription('Proof link').setRequired(false))
    .addAttachmentOption(opt =>
      opt.setName('proof_file').setDescription('Proof file upload').setRequired(false)),

  async execute(interaction) {
    if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const target    = interaction.options.getUser('user');
    const reason    = interaction.options.getString('reason');
    const proofLink = interaction.options.getString('proof_link');
    const proofFile = interaction.options.getAttachment('proof_file');
    const mod       = interaction.user;

    if (!proofLink && !proofFile) {
      return interaction.editReply({ content: '❌ You must provide at least one proof (link or file upload).' });
    }

    const proofText = proofLink ?? proofFile.url;
    const results   = [];

    // 1. Log to staff punishments channel
    try {
      const logChannel = await interaction.client.channels.fetch(config.staffPunishmentsChannelId);
      const embed = new EmbedBuilder()
        .setTitle('🚫 Staff Blacklist')
        .setColor(0x2C2F33)
        .addFields(
          { name: 'User',      value: `<@${target.id}> (${target.username})`,   inline: true },
          { name: 'Issued by', value: `<@${mod.id}> (${mod.username})`,         inline: true },
          { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
          { name: 'Reason',    value: reason,                                   inline: false },
          { name: 'Proof',     value: proofText,                                inline: false },
        );
      if (proofFile?.contentType?.startsWith('image/')) embed.setImage(proofFile.url);
      await logChannel.send({ embeds: [embed] });
      results.push('✅ Logged to staff punishments');
    } catch (err) {
      results.push(`⚠️ Log failed: ${err.message}`);
    }

    // 2. Kick from staff hub
    try {
      const staffHub = await interaction.client.guilds.fetch(config.staffHubGuildId);
      const member   = await staffHub.members.fetch(target.id).catch(() => null);
      if (member) {
        await member.kick(reason);
        results.push('✅ Kicked from staff hub');
      } else {
        results.push('⚠️ Not found in staff hub');
      }
    } catch (err) {
      results.push(`⚠️ Kick failed: ${err.message}`);
    }

    // 3. Add blacklist role in main server
    try {
      const mainGuild = await interaction.client.guilds.fetch(config.mainGuildId);
      const member    = await mainGuild.members.fetch(target.id).catch(() => null);
      if (member) {
        await member.roles.add(config.staffBlacklistRoleId, reason);
        results.push('✅ Blacklist role added in main server');
      } else {
        results.push('⚠️ Not found in main server');
      }
    } catch (err) {
      results.push(`⚠️ Role failed: ${err.message}`);
    }

    await interaction.editReply({
      content: `**Staff Blacklist — ${target.username}**\n${results.join('\n')}`,
    });
  },
};
