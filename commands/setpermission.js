const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getRoles, addRole, removeRole } = require('../handlers/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setpermission')
    .setDescription('Manage which roles can use mod commands in this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Allow a role to use mod commands')
        .addRoleOption(opt =>
          opt.setName('role').setDescription('Role to allow').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a role from mod command access')
        .addRoleOption(opt =>
          opt.setName('role').setDescription('Role to remove').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List roles that can use mod commands in this server')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'add') {
      const role = interaction.options.getRole('role');
      addRole(guildId, role.id);
      await interaction.reply({ content: `✅ <@&${role.id}> can now use mod commands in this server.`, ephemeral: true });

    } else if (sub === 'remove') {
      const role = interaction.options.getRole('role');
      removeRole(guildId, role.id);
      await interaction.reply({ content: `✅ <@&${role.id}> can no longer use mod commands in this server.`, ephemeral: true });

    } else if (sub === 'list') {
      const roles = getRoles(guildId);
      if (roles.length === 0) {
        await interaction.reply({ content: '⚠️ No roles configured — only Administrators can use mod commands in this server.\nUse `/setpermission add` to add roles.', ephemeral: true });
      } else {
        const list = roles.map(id => `<@&${id}>`).join('\n');
        await interaction.reply({ content: `**Allowed roles in this server:**\n${list}`, ephemeral: true });
      }
    }
  },
};
