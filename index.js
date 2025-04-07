// Import necessary modules
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { Pool } = require('pg');
const cheerio = require('cheerio'); // Added for web scraping
const http = require('http'); // Added for the basic HTTP server
require('dotenv').config();

// --- Configuration ---
const PREFIX = '!';
const EVENT_ROLE_NAME = 'Eventek';
const BETHESDA_STATUS_URL = 'https://status.bethesda.net/en'; // Status page URL
const TARGET_SERVICE_NAME = 'Fallout 76'; // Name to look for on the status page

const EVENTS_CONFIG = {
    'rumble': { eventName: "Radiation Rumble" },
    'sand': { eventName: "Line In The Sand" },
    'eviction': { eventName: "Eviction Notice" },
    'queen': { eventName: "Scorched Earth" },
    'colossal': { eventName: "A Colossal Problem" },
    'neuro': { eventName: "Neurological Warfare" },
    'seismic': { eventName: "Seismic Activity" },
    'burden': { eventName: "Beasts of Burden" },
    'campfire': { eventName: "Campfire Tales" },
    'caravan': { eventName: "Caravan Skyline Drive" },
    'pastimes': { eventName: "Dangerous Pastimes" },
    'guests': { eventName: "Distinguished Guests" },
    'encryptid': { eventName: "Encryptid" },
    'feed': { eventName: "Feed the People" },
    'range': { eventName: "Free Range" },
    'meditation': { eventName: "Guided Meditation" },
    'swamp': { eventName: "Heart of the Swamp" },
    'jail': { eventName: "Jail Break" },
    'lode': { eventName: "Lode Baring" },
    'jamboree': { eventName: "Moonshine Jamboree" },
    'mostwanted': { eventName: "Most Wanted" },
    'violent': { eventName: "One Violent Night" },
    'paradise': { eventName: "Project Paradise" },
    'safe': { eventName: "Safe and Sound" },
    'spin': { eventName: "Spin The Wheel" },
    'swarm': { eventName: "Swarm of Suitors" },
    'teatime': { eventName: "Tea Time" },
    'metal': { eventName: "Test Your Metal" },
    'path': { eventName: "The Path to Enlightenment" },
    'love': { eventName: "The Tunnel of Love" },
    'fever': { eventName: "Uranium Fever" },
};

// --- Database Setup ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle database client', err);
});

async function ensureTableExists() {
    const client = await pool.connect();
    try {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS user_igns (
                user_id TEXT PRIMARY KEY,
                ign TEXT NOT NULL,
                last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await client.query(createTableQuery);
        console.log("Database table 'user_igns' is ready.");
    } catch (err) {
        console.error("Fatal Error: Could not ensure database table 'user_igns' exists:", err);
        process.exit(1);
    } finally {
        client.release();
    }
}

// --- Discord Client Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel, Partials.Message],
});

// --- Helper Function for Status Scraping (REVISED SELECTORS) ---
async function getFallout76Status() {
    try {
        // Dynamically import node-fetch
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(BETHESDA_STATUS_URL);
        if (!response.ok) {
            // Log the status code for better debugging
            console.error(`Bethesda status page fetch failed with status: ${response.status}`);
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const html = await response.text();
        const $ = cheerio.load(html);

        let status = 'Status not found'; // Default status
        let foundService = false;

        // Find the div containing the target service name
        $('div').each(function() {
            if ($(this).text().trim() === TARGET_SERVICE_NAME) {
                foundService = true;
                // Get the next sibling div which should contain the status
                const statusElement = $(this).next('div'); // Find the immediate next sibling that is a div
                if (statusElement.length > 0) {
                    status = statusElement.text().trim();
                } else {
                    // This case might happen if the structure changes slightly
                    console.warn(`Found '${TARGET_SERVICE_NAME}' but could not find the next sibling div for status.`);
                    status = 'Could not determine status';
                }
                return false; // Stop iterating once found
            }
        });

        if (!foundService) {
             console.warn(`Could not find the div containing text '${TARGET_SERVICE_NAME}' on the status page.`);
             status = `${TARGET_SERVICE_NAME} not listed on status page`; // Service not found
        }

        return status;

    } catch (error) {
        // Log the specific error during fetch/parse
        console.error(`Error in getFallout76Status function: ${error}`);
        // Provide a user-friendly error message
        throw new Error('Failed to retrieve status from Bethesda page.');
    }
}


// --- Bot Event Handlers ---

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    try {
        await ensureTableExists();
        console.log(`Bot is ready and listening for commands with prefix "${PREFIX}"`);
    } catch (error) {
        console.error("Error during bot readiness routine:", error);
        process.exit(1);
    }
    // Start the keep-alive function
    keepAlive();
});

client.on('messageCreate', async (message) => {
    // Basic checks: ignore bots, DMs, messages without prefix
    if (message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;

    // Parse command and arguments
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const userId = message.author.id;

    // --- Command Handling ---

    if (command === 'addign') {
        const ign = args.join(' ');
        if (!ign) {
            return message.reply('Please provide your In-Game Name (IGN) after the command.\nExample: `!addign Your IGN Here`');
        }
        const query = `
            INSERT INTO user_igns (user_id, ign) VALUES ($1, $2)
            ON CONFLICT (user_id) DO UPDATE SET ign = EXCLUDED.ign, last_updated = CURRENT_TIMESTAMP;
        `;
        try {
            await pool.query(query, [userId, ign]);
            console.log(`Database: Added/Updated IGN for ${message.author.tag}: ${ign}`);
            return message.reply(`✅ Your IGN has been successfully set/updated to: **${ign}**`);
        } catch (err) {
            console.error("Database Error during !addign:", err);
            return message.reply("❌ An error occurred while saving your IGN. Please try again later.");
        }
    }

    else if (command === 'myign') {
        const query = 'SELECT ign FROM user_igns WHERE user_id = $1;';
        try {
            const result = await pool.query(query, [userId]);
            if (result.rows.length > 0) {
                return message.reply(`Your registered IGN is: **${result.rows[0].ign}**`);
            } else {
                return message.reply(`You haven't registered an IGN yet. Use \`${PREFIX}addign [your IGN]\` to set one.`);
            }
        } catch (err) {
            console.error("Database Error during !myign:", err);
            return message.reply("❌ An error occurred while retrieving your IGN. Please try again later.");
        }
    }

    else if (command === 'removeign') {
        const query = 'DELETE FROM user_igns WHERE user_id = $1;';
        try {
            const result = await pool.query(query, [userId]);
            if (result.rowCount > 0) {
                console.log(`Database: Removed IGN for ${message.author.tag}`);
                return message.reply("✅ Your registered IGN has been removed.");
            } else {
                return message.reply("You don't currently have an IGN registered to remove.");
            }
        } catch (err) {
            console.error("Database Error during !removeign:", err);
            return message.reply("❌ An error occurred while trying to remove your IGN. Please try again later.");
        }
    }

    // --- Status Command (Uses updated helper function) ---
    else if (command === 'status') {
        try {
            // Indicate the bot is working on it
            await message.channel.sendTyping();
            const status = await getFallout76Status();
            // Provide a slightly more informative reply
            return message.reply(`Bethesda Status Portal reports **${TARGET_SERVICE_NAME}** is currently: **${status}**\n(Source: ${BETHESDA_STATUS_URL})`);
        } catch (error) {
            // Log the error from the helper function if it was re-thrown
            console.error("Error executing !status command:", error.message);
            // Inform the user about the failure
            return message.reply(`❌ Sorry, I couldn't retrieve the status for ${TARGET_SERVICE_NAME}. The status page might be unavailable, changed, or the service wasn't listed.`);
        }
    }

    // --- Event Announce Command ---
    else if (EVENTS_CONFIG[command]) {
        const eventConfig = EVENTS_CONFIG[command];
        const { eventName } = eventConfig;
        let userIGN = null;

        // Fetch IGN
        const getIgnQuery = 'SELECT ign FROM user_igns WHERE user_id = $1;';
        try {
            const result = await pool.query(getIgnQuery, [userId]);
            if (result.rows.length > 0) {
                userIGN = result.rows[0].ign;
            } else {
                return message.reply(`You need to set your IGN first using \`${PREFIX}addign [your IGN]\` before announcing events.`);
            }
        } catch (err) {
            console.error(`Database Error fetching IGN for event command !${command}:`, err);
            return message.reply("❌ An error occurred while checking your registered IGN. Please try again later.");
        }

        // Find the role
        const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === EVENT_ROLE_NAME.toLowerCase());
        if (!role) {
            console.error(`Configuration Error: Role "${EVENT_ROLE_NAME}" not found on server "${message.guild.name}" for command "!${command}"`);
            return message.reply(`❌ Error: The role "@${EVENT_ROLE_NAME}" was not found. Please check the configuration or create the role.`);
        }

        // Send notification
        const notification = `Attention, <@&${role.id}>! ${message.author} has **${eventName}** active on their server!\nTheir IGN is **${userIGN}**. Feel free to join them!`;
        try {
            await message.channel.send(notification);
            console.log(`Sent notification for ${eventName} triggered by ${message.author.tag}`);
        } catch (error) {
            console.error(`Discord API Error sending event notification for ${eventName}:`, error);
            message.reply("❌ Sorry, I couldn't send the notification message. Check my permissions.");
        }
        return; // Explicit return after handling the command
    }

    // Optional: Handle unknown commands (uncomment if desired)
    // else {
    //     message.reply(`Unknown command: \`${PREFIX}${command}\`. Try \`!addign\`, \`!myign\`, \`!removeign\`, \`!status\`, or an event command like \`!rumble\`.`);
    // }
});

// --- Keep-Alive Function ---
function keepAlive() {
    const url = process.env.RENDER_EXTERNAL_URL;
    if (url) {
        console.log(`Setting up keep-alive pings to ${url}`);
        setInterval(async () => {
            try {
                const fetch = (await import('node-fetch')).default;
                const response = await fetch(url);
                if (response.ok) {
                    console.log(`Pinged ${url} successfully at ${new Date().toISOString()}`);
                } else {
                    console.error(`Failed to ping ${url}. Status code: ${response.status}`);
                }
            } catch (err) {
                console.error(`Error pinging ${url}:`, err);
            }
        }, 5 * 60 * 1000); // Ping every 5 minutes
    } else {
        console.warn('RENDER_EXTERNAL_URL is not set. Keep-alive pings are disabled.');
    }
}

// --- Login ---
const token = process.env.DISCORD_TOKEN;
const dbUrl = process.env.DATABASE_URL;
const port = process.env.PORT || 8080;

// Check for essential environment variables
if (!token) {
    console.error("FATAL ERROR: DISCORD_TOKEN environment variable not found.");
    process.exit(1);
}
if (!dbUrl) {
    console.error("FATAL ERROR: DATABASE_URL environment variable not found.");
    process.exit(1);
}

// Basic HTTP server for Render health checks
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
}).listen(port, () => {
     console.log(`HTTP server listening on port ${port} for health checks.`);
});

// Login to Discord AFTER setting up the HTTP server
client.login(token).then(() => {
    console.log(`Successfully logged in to Discord as ${client.user.tag}`);
}).catch(error => {
    console.error("FATAL ERROR: Failed to login to Discord:", error);
    process.exit(1);
});
