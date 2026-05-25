const { SlashCommandBuilder, PermissionFlagsBits, Role } = require('discord.js');
const { addToWhitelist, removeFromWhitelist, getWhitelist } = require('../handlers/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Protect a user or role from all punishment commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a user or role to the whitelist')
        .addMentionableOption(opt =>
          opt.setName('target').setDescription('User or role to protect').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a user or role from the whitelist')
        .addMentionableOption(opt =>
          opt.setName('target').setDescription('User or role to unprotect').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Show all whitelisted users and roles in this server')),

  async execute(interaction) {
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'add' || sub === 'remove') {
      const target = interaction.options.getMentionable('target');
      const isRole = target instanceof Role || target?.constructor?.name === 'Role';
      const type   = isRole ? 'roles' : 'users';
      const id     = target.id;
      const mention = isRole ? `<@&${id}>` : `<@${id}>`;

      if (sub === 'add') {
        addToWhitelist(guildId, type, id);
        await interaction.reply({ content: `✅ ${mention} is now whitelisted — they cannot be punished.`, ephemeral: true });
      } else {
        removeFromWhitelist(guildId, type, id);
        await interaction.reply({ content: `✅ ${mention} has been removed from the whitelist.`, ephemeral: true });
      }

    } else if (sub === 'list') {
      const wl = getWhitelist(guildId);
      const users = wl.users.map(id => `<@${id}>`).join('\n') || 'None';
      const roles = wl.roles.map(id => `<@&${id}>`).join('\n') || 'None';
      await interaction.reply({
        content: `**Whitelisted Users:**\n${users}\n\n**Whitelisted Roles:**\n${roles}`,
        ephemeral: true,
      });
    }
  },
};
