const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('migrate')
    .setDescription('Move the current ticket to a different category (appeals server only)')
    .addStringOption(opt =>
      opt.setName('category')
        .setDescription('Target category')
        .setRequired(true)
        .addChoices(
          { name: 'Regular Appeals', value: 'regular' },
          { name: 'Staff Tickets',   value: 'staff'   },
          { name: 'Cyber Security',  value: 'cyber'   },
        )
    ),

  async execute(interaction) {
    // Handled in index.js appeals guild block before this runs
    await interaction.reply({ content: '❌ This command only works in the appeals server.', ephemeral: true });
  },
};
