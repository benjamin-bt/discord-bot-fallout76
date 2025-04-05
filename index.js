// Import necessary modules
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { Pool } = require('pg'); // Import the pg Pool class
require('dotenv').config(); // For loading DISCORD_TOKEN and DATABASE_URL from .env

// --- Configuration ---
const PREFIX = '!'; // Command prefix

// Define the events, their command names, full names, and associated role names
// *** IMPORTANT: Role names MUST exactly match the role names in your Discord server ***
const EVENTS_CONFIG = {
    'rumble': { eventName: "Radiation Rumble", roleName: "Rumble" },
    'sand': { eventName: "Line In The Sand", roleName: "Sand" },
    'eviction': { eventName: "Eviction Notice", roleName: "Eviction" },
    'queen': { eventName: "Scorched Earth", roleName: "Queen" },
    // --- Template for adding new events ---
    /*
    'neweventcommand': { // This is the command users will type (e.g., !neweventcommand)
        eventName: "Full Name of the New Event", // This is the name displayed in the message
        roleName: "RoleNameToPing" // This is the exact name of the role to ping
    },
    */
};

// --- Database Setup ---
// Create a connection pool using the DATABASE_URL environment variable
// This URL should be available in your deployment environment (e.g., Render)
// or in your local .env file for development.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // SSL might be required depending on your database provider (Render requires it)
    // The connection string usually handles this, but you can configure explicitly if needed:
    // ssl: {
    //   rejectUnauthorized: false // Adjust based on your provider/setup
    // }
});

// Optional: Event listener for database connection errors on idle clients
pool.on('error', (err, client) => {
    console.error('Unexpected error on idle database client', err);
    // Consider adding more robust error handling or logging here
});

// Function to ensure the necessary database table exists on startup
async function ensureTableExists() {
    // Acquire a client from the pool
    const client = await pool.connect();
    try {
        // SQL command to create the table 'user_igns' if it doesn't exist.
        // user_id: Stores the Discord User ID as text (VARCHAR/TEXT). It's the PRIMARY KEY.
        // ign: Stores the In-Game Name as text, cannot be null.
        // last_updated: Optional timestamp automatically updated on insert/update.
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS user_igns (
                user_id TEXT PRIMARY KEY,
                ign TEXT NOT NULL,
                last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `;
        // Execute the query
        await client.query(createTableQuery);
        console.log("Database table 'user_igns' is ready.");
    } catch (err) {
        // Log error if table creation fails and exit, as the bot cannot function without it.
        console.error("Fatal Error: Could not ensure database table 'user_igns' exists:", err);
        process.exit(1); // Exit the process if DB setup fails
    } finally {
        // IMPORTANT: Always release the client back to the pool
        client.release();
    }
}

// --- Discord Client Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Make sure this is enabled in Dev Portal
        GatewayIntentBits.GuildMembers, // Needed to ensure member caching
    ],
    partials: [Partials.Channel, Partials.Message], // Recommended for reliability
});

// --- Bot Event Handlers ---

// When the bot is ready
client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    try {
        // Ensure the database table exists before the bot starts accepting commands.
        await ensureTableExists();
        console.log(`Bot is ready and listening for commands with prefix "${PREFIX}"`);
    } catch (error) {
        // Error during table check handled in ensureTableExists, but catch any unexpected issues.
        console.error("Error during bot readiness routine:", error);
        process.exit(1); // Exit if essential startup fails
    }
});

// When a message is created
client.on('messageCreate', async (message) => {
    // Ignore messages from bots, DMs, and those without the prefix
    if (message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;

    // Parse the command and arguments
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const userId = message.author.id; // Discord User ID

    // --- Command Handling ---

    // !addign command
    if (command === 'addign') {
        const ign = args.join(' '); // Allow IGNs with spaces
        if (!ign) {
            return message.reply('Please provide your In-Game Name (IGN) after the command.\nExample: `!addign Your IGN Here`');
        }

        // SQL query using INSERT ... ON CONFLICT (UPSERT)
        // If user_id already exists, it updates the ign and last_updated timestamp.
        // Otherwise, it inserts a new row.
        // Uses parameterized queries ($1, $2) to prevent SQL injection.
        const query = `
            INSERT INTO user_igns (user_id, ign)
            VALUES ($1, $2)
            ON CONFLICT (user_id) DO UPDATE SET
                ign = EXCLUDED.ign,
                last_updated = CURRENT_TIMESTAMP;
        `;
        const values = [userId, ign]; // Parameters for the query

        try {
            // Execute the query using the connection pool
            await pool.query(query, values);
            console.log(`Database: Added/Updated IGN for ${message.author.tag}: ${ign}`);
            return message.reply(`✅ Your IGN has been successfully set/updated to: **${ign}**`);
        } catch (err) {
            console.error("Database Error during !addign:", err);
            return message.reply("❌ An error occurred while saving your IGN. Please try again later.");
        }
    }

    // !myign command
    else if (command === 'myign') {
        // SQL query to select the IGN for the specific user_id.
        // Uses a parameterized query ($1).
        const query = 'SELECT ign FROM user_igns WHERE user_id = $1;';
        const values = [userId]; // Parameter for the query

        try {
            // Execute the query
            const result = await pool.query(query, values);

            // Check if any rows were returned
            if (result.rows.length > 0) {
                // User found, extract the IGN from the first row
                const userIGN = result.rows[0].ign;
                return message.reply(`Your registered IGN is: **${userIGN}**`);
            } else {
                // No rows returned, user hasn't registered an IGN
                return message.reply(`You haven't registered an IGN yet. Use \`${PREFIX}addign [your IGN]\` to set one.`);
            }
        } catch (err) {
            console.error("Database Error during !myign:", err);
            return message.reply("❌ An error occurred while retrieving your IGN. Please try again later.");
        }
    }

    // Check if the command matches a configured event
    else if (EVENTS_CONFIG[command]) {
        const eventConfig = EVENTS_CONFIG[command];
        const { eventName, roleName } = eventConfig;
        let userIGN = null; // Variable to store the fetched IGN

        // --- Fetch User's IGN from Database ---
        const getIgnQuery = 'SELECT ign FROM user_igns WHERE user_id = $1;';
        const getIgnValues = [userId];

        try {
            const result = await pool.query(getIgnQuery, getIgnValues);
            if (result.rows.length > 0) {
                // IGN found in the database
                userIGN = result.rows[0].ign;
            } else {
                // User not found in the database
                return message.reply(`You need to set your IGN first using \`${PREFIX}addign [your IGN]\` before announcing events.`);
            }
        } catch (err) {
            console.error(`Database Error fetching IGN for event command !${command}:`, err);
            return message.reply("❌ An error occurred while checking your registered IGN. Please try again later.");
        }
        // --- End Fetch User's IGN ---

        // If we reached here, userIGN contains the registered IGN.

        // Find the role on the server (case-insensitive search for robustness)
        const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());

        if (!role) {
             console.error(`Configuration Error: Role "${roleName}" not found on server "${message.guild.name}" for command "!${command}"`);
             // Inform user the specific role is missing
             return message.reply(`❌ Error: The role "@${roleName}" was not found on this server. Please ask an admin to check the role name in the bot's configuration or create the role.`);
        }

        // Construct and send the notification using the fetched IGN
        // Using <@&ROLE_ID> ensures the role is pinged correctly
        const notification = `Attention, <@&${role.id}>! ${message.author} has ${eventName} active on their server!\nTheir IGN is **${userIGN}**. Feel free to join them!`;

        try {
            await message.channel.send(notification);
            console.log(`Sent notification for ${eventName} triggered by ${message.author.tag}`);
            // Optional: Delete the user's command message after success
            // if (message.deletable) {
            //     await message.delete().catch(console.error); // Catch potential permission errors
            // }
        } catch (error) {
            console.error(`Discord API Error sending event notification for ${eventName}:`, error);
            message.reply("❌ Sorry, I couldn't send the notification message. Please check my permissions in this channel.");
        }

        return; // Stop processing after handling the command
    }

    // Optional: Handle unknown commands
    // else {
    //     message.reply(`Unknown command: \`${PREFIX}${command}\`. Try \`!addign\`, \`!myign\`, or an event command like \`!rumble\`.`);
    // }

});

// --- Login ---
// Check for essential environment variables before trying to log in
const token = process.env.DISCORD_TOKEN;
const dbUrl = process.env.DATABASE_URL;

if (!token) {
    console.error("FATAL ERROR: DISCORD_TOKEN environment variable not found.");
    process.exit(1); // Exit if token is missing
}
if (!dbUrl) {
    console.error("FATAL ERROR: DATABASE_URL environment variable not found.");
    process.exit(1); // Exit if database URL is missing
}

// Log in to Discord
client.login(token).catch(error => {
    console.error("FATAL ERROR: Failed to login to Discord:", error);
    process.exit(1); // Exit if login fails
});
