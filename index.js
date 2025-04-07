// Import necessary modules
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { Pool } = require('pg');
// Removed: const fetch = require('node-fetch'); // Don't require globally for v3+
require('dotenv').config();
const axios = require('axios'); // For making HTTP requests
const puppeteer = require('puppeteer'); // Puppeteer for web scraping

// Function to scrape Fallout 76's status using Browserless
async function getFallout76Status() {
    const url = 'https://status.bethesda.net/en';
    let browser;

    try {
        // Launch Puppeteer in headless mode with minimal resources
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox', // Required for Render
                '--disable-setuid-sandbox', // Required for Render
                '--disable-dev-shm-usage', // Reduce memory usage
                '--disable-gpu', // Disable GPU acceleration
                '--no-zygote', // Reduce resource usage
            ],
        });

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        // Wait for the Fallout 76 status element to load
        await page.waitForSelector('.component-container');

        // Extract the status of Fallout 76
        const status = await page.evaluate(() => {
            const fallout76Element = Array.from(document.querySelectorAll('.component-container'))
                .find(el => el.textContent.includes('Fallout 76'));
            return fallout76Element
                ? fallout76Element.querySelector('.component-status').textContent.trim()
                : 'Unknown';
        });

        return status;
    } catch (error) {
        console.error('Error scraping Fallout 76 status with Puppeteer:', error);
        return 'Error retrieving status';
    } finally {
        if (browser) await browser.close();
    }
}

// --- Configuration ---
const PREFIX = '!';
const EVENT_ROLE_NAME = 'Eventek';
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
    if (message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const userId = message.author.id;

    // --- Command Handling ---

    if (command === 'addign') {
        const ign = args.join(' ');
        if (!ign) {
            // return message.reply('Please provide your In-Game Name (IGN) after the command.\nExample: `!addign Your IGN Here`');
            return message.reply('Kérlek add meg a játékban használt nevedet (IGN).\nPéldául: `!addign [játékbeli neved]`');
        }

        const query = `
            INSERT INTO user_igns (user_id, ign)
            VALUES ($1, $2)
            ON CONFLICT (user_id) DO UPDATE SET
                ign = EXCLUDED.ign,
                last_updated = CURRENT_TIMESTAMP;
        `;
        const values = [userId, ign];

        try {
            await pool.query(query, values);
            console.log(`Database: Added/Updated IGN for ${message.author.tag}: ${ign}`);
            // return message.reply(`✅ Your IGN has been successfully set/updated to: **${ign}**`);
            return message.reply(`✅ A játékbeli neved (IGN) sikeresen hozzá lett adva/frissítve lett erre: **${ign}**`);
        } catch (err) {
            console.error("Database Error during !addign:", err);
            // return message.reply("❌ An error occurred while saving your IGN. Please try again later.");
            return message.reply("❌ Hiba történt a játékbeli neved (IGN) mentésekor. Próbáld újra később.");
        }
    }

    else if (command === 'myign') {
        const query = 'SELECT ign FROM user_igns WHERE user_id = $1;';
        const values = [userId];

        try {
            const result = await pool.query(query, values);
            if (result.rows.length > 0) {
                const userIGN = result.rows[0].ign;
                // return message.reply(`Your registered IGN is: **${userIGN}**`);
                return message.reply(`A regisztrált játékbeli neved (IGN): **${userIGN}**`);
            } else {
                // return message.reply(`You haven't registered an IGN yet. Use \`${PREFIX}addign [your IGN]\` to set one.`);
                return message.reply(`Még nem adtál meg játékbeli nevet (IGN). Használd a \`${PREFIX}addign [játékbeli neved]\` parancsot a hozzáadáshoz.`);
            }
        } catch (err) {
            console.error("Database Error during !myign:", err);
            // return message.reply("❌ An error occurred while retrieving your IGN. Please try again later.");
            return message.reply("❌ Hiba történt a játékbeli neved (IGN) lekérdezésekor. Próbáld újra később.");
        }
    }

    else if (command === 'removeign') {
        const query = 'DELETE FROM user_igns WHERE user_id = $1;';
        const values = [userId];

        try {
            const result = await pool.query(query, values);
            if (result.rowCount > 0) {
                console.log(`Database: Removed IGN for ${message.author.tag}`);
                //return message.reply("✅ Your registered IGN has been removed.");
                return message.reply("✅ A játékbeli neved (IGN) eltávolítva.");
            } else {
                //return message.reply("You don't currently have an IGN registered to remove.");
                return message.reply("Jelenleg nincs játékbeli neved (IGN) regisztrálva, amit eltávolíthatnál.");
            }
        } catch (err) {
            console.error("Database Error during !removeign:", err);
            // return message.reply("❌ An error occurred while trying to remove your IGN. Please try again later.");
            return message.reply("❌ Hiba történt a játékbeli neved (IGN) eltávolításakor. Próbáld újra később.");
        }
    }

    else if (command === 'status') {
        try {
            const status = await getFallout76Status();
            return message.reply(`Fallout 76 Status: **${status}**`);
        } catch (error) {
            console.error('Error handling !status command:', error);
            return message.reply('❌ Hiba történt a Fallout 76 állapotának lekérdezésekor. Próbáld újra később.');
        }
    }

    // --- Event Announce Command ---
    else if (EVENTS_CONFIG[command]) {
        const eventConfig = EVENTS_CONFIG[command];
        const { eventName } = eventConfig; //  Use the eventName
        let userIGN = null;

        const getIgnQuery = 'SELECT ign FROM user_igns WHERE user_id = $1;';
        const getIgnValues = [userId];

        try {
            const result = await pool.query(getIgnQuery, getIgnValues);
            if (result.rows.length > 0) {
                userIGN = result.rows[0].ign;
            } else {
                // return message.reply(`You need to set your IGN first using \`${PREFIX}addign [your IGN]\` before announcing events.`);
                return message.reply(`Először állítsd be a játékbeli nevedet (IGN) a \`${PREFIX}addign [játékbeli neved]\` paranccsal, mielőtt eseményeket jelentesz.`);
            }
        } catch (err) {
            console.error(`Database Error fetching IGN for event command !${command}:`, err);
            // return message.reply("❌ An error occurred while checking your registered IGN. Please try again later.");
            return message.reply("❌ Hiba történt a játékbeli neved (IGN) ellenőrzésekor. Próbáld újra később.");
        }

        // Find the Eventek role
        const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === EVENT_ROLE_NAME.toLowerCase());

        if (!role) {
            console.error(`Configuration Error: Role "${EVENT_ROLE_NAME}" not found on server "${message.guild.name}" for command "!${command}"`);
            // return message.reply(`❌ Error: The role "@${EVENT_ROLE_NAME}" was not found on this server. Please ask an admin to check the role name in the bot's configuration or create the role.`);
            return message.reply(`❌ Hiba: A "${EVENT_ROLE_NAME}" szerepkör nem található ezen a szerveren. Kérlek kérdezd meg az adminisztrátort, hogy ellenőrizze a szerepkör nevét a bot konfigurációjában, vagy hozza létre a szerepkört.`);
        }

        //const notification = `Attention, <@&${role.id}>! ${message.author} has ${eventName} active on their server!\nTheir IGN is **${userIGN}**. Feel free to join them!`;
        const notification = `Figyelem, <@&${role.id}>! ${message.author} szerverén éppen a ${eventName} esemény aktív!\nA játékbeli neve: **${userIGN}**. Nyugodtan csatlakozz hozzá!`;

        try {
            await message.channel.send(notification);
            console.log(`Sent notification for ${eventName} triggered by ${message.author.tag}`);
        } catch (error) {
            console.error(`Discord API Error sending event notification for ${eventName}:`, error);
            // message.reply("❌ Sorry, I couldn't send the notification message. Please check my permissions in this channel.");
            message.reply("❌ Sajnálom, nem tudtam elküldeni az értesítést. Kérlek ellenőrizd a jogosultságaimat ebben a csatornában.");
        }
        return;
    }

    // Optional: Handle unknown commands
    // else {
    //  message.reply(`Unknown command: \`${PREFIX}${command}\`. Try \`!addign\`, \`!myign\`, \`!removeign\`, or an event command like \`!rumble\`.`);
    // }
});

// --- Keep-Alive Function (FIXED) ---
function keepAlive() {
    const url = process.env.RENDER_EXTERNAL_URL; // Get the Render URL from the environment
    if (url) {
        console.log(`Setting up keep-alive pings to ${url}`);
        setInterval(async () => { // Keep async here
            try {
                // Dynamically import node-fetch within the async function
                const fetch = (await import('node-fetch')).default;
                const response = await fetch(url); // Now fetch should work
                if (response.ok) {
                    console.log(`Pinged ${url} successfully at ${new Date().toISOString()}`);
                } else {
                    console.error(`Failed to ping ${url}. Status code: ${response.status}`);
                }
            } catch (err) {
                // Catch errors during import or fetch
                console.error(`Error pinging ${url}:`, err);
            }
        }, 5 * 60 * 1000); // Ping every 5 minutes (in milliseconds)
    } else {
        console.warn('RENDER_EXTERNAL_URL is not set. Keep-alive pings are disabled.');
    }
}


// --- Login ---
const token = process.env.DISCORD_TOKEN;
const dbUrl = process.env.DATABASE_URL;
const port = process.env.PORT || 8080; // Render usually sets PORT

if (!token) {
    console.error("FATAL ERROR: DISCORD_TOKEN environment variable not found.");
    process.exit(1);
}
if (!dbUrl) {
    console.error("FATAL ERROR: DATABASE_URL environment variable not found.");
    process.exit(1);
}

// Basic HTTP server to respond to Render health checks
const http = require('http');
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
    process.exit(1); // Exit if Discord login fails
});
