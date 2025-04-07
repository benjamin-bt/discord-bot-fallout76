// Import necessary modules from discord.js and environment config
const { REST, Routes, ApplicationCommandOptionType } = require('discord.js');
require('dotenv').config(); // To load environment variables

// --- Configuration ---
// Make sure these environment variables are set in your .env file or environment
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID; // Your bot's Application ID
const guildId = process.env.DEV_GUILD_ID; // Optional: Guild ID for testing/development registration

if (!token || !clientId) {
    console.error('FATAL ERROR: DISCORD_TOKEN and DISCORD_CLIENT_ID environment variables are required.');
    process.exit(1);
}

// Import the event configuration to generate choices for the /event command
const { EVENTS_CONFIG } = require('./index'); // Assuming index.js exports it or define it here

// --- Command Definitions ---

// Helper function to create event choices for autocomplete
const createEventChoices = () => {
    return Object.entries(EVENTS_CONFIG).map(([key, config]) => ({
        name: config.eventName, // User sees the full name
        value: key             // Bot uses the short key internally
    }));
};

const commands = [
    // /addign command
    {
        name: 'addign',
        description: 'Add or update your Fallout 76 In-Game Name (IGN). / Add meg vagy frissítsd a Fallout 76 neved.',
        options: [
            {
                name: 'ign',
                type: ApplicationCommandOptionType.String, // Expecting a string input
                description: 'Your In-Game Name. / A játékbeli neved.',
                required: true, // This option is mandatory
            },
        ],
    },
    // /myign command
    {
        name: 'myign',
        description: 'Check your currently registered IGN. / Ellenőrizd a regisztrált IGN-ed.',
    },
    // /removeign command
    {
        name: 'removeign',
        description: 'Remove your registered IGN. / Távolítsd el a regisztrált IGN-ed.',
    },
    //status command
    {
        name: 'status',
        description: 'Link to check the game servers\' status. / Link a játék szervereinek állapotának ellenőrzéséhez.',
    },
    // /event command (consolidated)
    {
        name: '76event',
        description: 'Announce a Fallout 76 event happening on your server. / Jelents be egy futó Fallout 76 eseményt.',
        options: [
            {
                name: 'name',
                type: ApplicationCommandOptionType.String, // Expecting a string input
                description: 'The name of the event. / Az esemény neve.',
                required: true, // This option is mandatory
                autocomplete: true, // Enable autocomplete for this option
            },
        ],
    },
    // Add other commands here if needed
];

// --- Registration Logic ---
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        let data;
        if (guildId) {
            // Register commands to a specific guild (faster updates for testing)
            console.log(`Registering commands for guild: ${guildId}`);
            data = await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands },
            );
            console.log(`Successfully registered ${data.length} guild commands.`);
        } else {
            // Register commands globally (can take up to an hour to propagate)
            console.log('Registering commands globally.');
            data = await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands },
            );
            console.log(`Successfully registered ${data.length} global commands.`);
        }

    } catch (error) {
        // Log any errors that occur during registration
        console.error('Error refreshing application commands:', error);
    }
})();

// Export event choices if needed elsewhere, or just use directly in index.js
// module.exports = { createEventChoices }; // Optional export
