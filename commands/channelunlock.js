const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('channelunlock')
    .setDescription('Unlock the current channel for @everyone'),

  async execute(interaction) {
    if (!interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ You need Manage Server permission.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      SendMessages: null,
    });

    await interaction.editReply({ content: `🔓 **#${interaction.channel.name}** has been unlocked.` });
  },
};
