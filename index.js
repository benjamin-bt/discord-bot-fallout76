// Import necessary modules
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { Pool } = require('pg');
const http = require('http'); // For health check server
const puppeteer = require('puppeteer'); // Puppeteer for web scraping
require('dotenv').config();
// Note: axios is required in package.json but not used here. Remove if not needed elsewhere.
// const axios = require('axios');

// --- Puppeteer Configuration ---
const BETHESDA_STATUS_URL = 'https://status.bethesda.net/en';
const TARGET_SERVICE_NAME = 'Fallout 76';
const puppeteerOptions = {
  // Explicitly set the path where Chrome is installed in the Dockerfile
  executablePath: '/usr/bin/google-chrome-stable',
  headless: true,
  args: [
    '--no-sandbox', // Required for running as root in Docker, but we run as pptruser
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage', // Avoids issues with limited /dev/shm size in Docker
    '--disable-gpu', // Disable GPU hardware acceleration
    '--no-zygote' // Helps reduce resource usage
    // Note: '--single-process' is sometimes suggested but can cause instability
  ]
};

// Function to scrape Fallout 76's status using Puppeteer
async function getFallout76Status() {
    let browser = null; // Define browser outside try block for finally scope
    console.log('Launching Puppeteer browser inside Docker...');
    console.log(`Using executable path: ${puppeteerOptions.executablePath}`);

    try {
        browser = await puppeteer.launch(puppeteerOptions);
        const page = await browser.newPage();

        // Set a common User-Agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36'); // Example User Agent

        console.log(`Navigating to: ${BETHESDA_STATUS_URL}`);
        // Navigate and wait for the network to be mostly idle
        // Increased timeout for potentially slow loads in container environments
        await page.goto(BETHESDA_STATUS_URL, { waitUntil: 'networkidle2', timeout: 90000 }); // Use networkidle2, 90s timeout

        console.log('Page loaded, evaluating content...');

        // Use page.evaluate to run code within the browser context
        // Using selectors based on user's previous finding: <div class="status-container"><div>Name</div><div>Status</div></div>
        const status = await page.evaluate((targetServiceName) => {
            let foundStatus = 'Status not found'; // Default inside evaluate
            let serviceFound = false;

            // Select all divs that are direct children of elements with class 'status-container'
            const nameDivs = document.querySelectorAll('.status-container > div:first-child');

            for (const div of nameDivs) {
                if (div.textContent && div.textContent.trim() === targetServiceName) {
                    serviceFound = true;
                    // Get the next element sibling (should be the status div)
                    const statusElement = div.nextElementSibling;
                    if (statusElement && statusElement.textContent) {
                        foundStatus = statusElement.textContent.trim();
                    } else {
                        foundStatus = 'Could not determine status'; // Status element missing or empty
                    }
                    break; // Stop searching once found
                }
            }

             if (!serviceFound) {
                // If the loop finishes without finding the service
                foundStatus = `${targetServiceName} not listed on status page`;
             }

            return foundStatus; // Return the found status
        }, TARGET_SERVICE_NAME); // Pass TARGET_SERVICE_NAME into evaluate

        console.log(`Puppeteer evaluation completed. Found status: ${status}`);
        return status;

    } catch (error) {
        console.error(`Error during Puppeteer operation in getFallout76Status: ${error}`);
        if (error.message.includes('Failed to launch the browser process')) {
             console.error('Error suggests Chrome executable is still missing or inaccessible within Docker. Check Dockerfile installation steps and permissions.');
             throw new Error('Failed to launch browser - Check Dockerfile configuration.');
        }
        if (error.name === 'TimeoutError') {
             console.error(`Navigation timeout occurred when loading ${BETHESDA_STATUS_URL}`);
             throw new Error('Failed to load Bethesda status page within timeout.');
        }
        throw new Error('Failed to retrieve status using Puppeteer.'); // Generic error for other issues
    } finally {
        if (browser) {
            console.log('Closing Puppeteer browser...');
            await browser.close();
        }
    }
}

// --- Configuration ---
const PREFIX = '!';
const EVENT_ROLE_NAME = 'Eventek'; // Role name for event pings
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
    'caravan': { eventName: "Caravan Skyline Drive" }, // Assuming this is the correct event name
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
        rejectUnauthorized: false // Common setting for Heroku/Render PG
    }
});

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle database client', err);
});

// Function to ensure the database table exists
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
        process.exit(1); // Exit if table cannot be ensured
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
        GatewayIntentBits.GuildMembers, // Needed for GuildMember related events/properties if used
    ],
    partials: [Partials.Channel, Partials.Message], // Necessary for events in uncached channels/messages
});

// --- Bot Event Handlers ---

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    try {
        await ensureTableExists(); // Ensure DB table is ready before accepting commands
        console.log(`Bot is ready and listening for commands with prefix "${PREFIX}"`);
    } catch (error) {
        console.error("Error during bot readiness routine:", error);
        process.exit(1); // Exit if essential setup fails
    }
    // Start the keep-alive function to prevent Render service from sleeping (if applicable)
    keepAlive();
});

client.on('messageCreate', async (message) => {
    // Ignore messages from bots, DMs, or those not starting with the prefix
    if (message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;

    // Parse command and arguments
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const userId = message.author.id;

    // --- Command Handling ---

    // Command: !addign [Your IGN]
    if (command === 'addign') {
        const ign = args.join(' ');
        if (!ign) {
            return message.reply('Kérlek add meg a játékban használt nevedet (IGN).\nPéldául: `!addign [játékbeli neved]`');
        }
        const query = `
            INSERT INTO user_igns (user_id, ign) VALUES ($1, $2)
            ON CONFLICT (user_id) DO UPDATE SET ign = EXCLUDED.ign, last_updated = CURRENT_TIMESTAMP;
        `;
        try {
            await pool.query(query, [userId, ign]);
            console.log(`Database: Added/Updated IGN for ${message.author.tag}: ${ign}`);
            return message.reply(`✅ A játékbeli neved (IGN) sikeresen hozzá lett adva/frissítve lett erre: **${ign}**`);
        } catch (err) {
            console.error("Database Error during !addign:", err);
            return message.reply("❌ Hiba történt a játékbeli neved (IGN) mentésekor. Próbáld újra később.");
        }
    }

    // Command: !myign
    else if (command === 'myign') {
        const query = 'SELECT ign FROM user_igns WHERE user_id = $1;';
        try {
            const result = await pool.query(query, [userId]);
            if (result.rows.length > 0) {
                return message.reply(`A regisztrált játékbeli neved (IGN): **${result.rows[0].ign}**`);
            } else {
                return message.reply(`Még nem adtál meg játékbeli nevet (IGN). Használd a \`${PREFIX}addign [játékbeli neved]\` parancsot a hozzáadáshoz.`);
            }
        } catch (err) {
            console.error("Database Error during !myign:", err);
            return message.reply("❌ Hiba történt a játékbeli neved (IGN) lekérdezésekor. Próbáld újra később.");
        }
    }

    // Command: !removeign
    else if (command === 'removeign') {
        const query = 'DELETE FROM user_igns WHERE user_id = $1;';
        try {
            const result = await pool.query(query, [userId]);
            if (result.rowCount > 0) {
                console.log(`Database: Removed IGN for ${message.author.tag}`);
                return message.reply("✅ A játékbeli neved (IGN) eltávolítva.");
            } else {
                return message.reply("Jelenleg nincs játékbeli neved (IGN) regisztrálva, amit eltávolíthatnál.");
            }
        } catch (err) {
            console.error("Database Error during !removeign:", err);
            return message.reply("❌ Hiba történt a játékbeli neved (IGN) eltávolításakor. Próbáld újra később.");
        }
    }

    // Command: !status
    else if (command === 'status') {
        try {
            await message.channel.sendTyping(); // Show bot is working
            console.log(`User ${message.author.tag} triggered !status command.`);
            const status = await getFallout76Status(); // Uses Puppeteer via Docker
            return message.reply(`A Bethesda Status Portal szerint a **${TARGET_SERVICE_NAME}** állapota jelenleg: **${status}**\n(Forrás: ${BETHESDA_STATUS_URL})`);
        } catch (error) {
            console.error(`Error executing !status command for ${message.author.tag}:`, error.message);
            // Give specific feedback based on error type
             if (error.message.includes('Failed to launch browser')) {
                 return message.reply(`❌ Hiba történt a **${TARGET_SERVICE_NAME}** állapotának lekérdezésekor. Probléma volt a háttérben futó böngésző indításával (Docker konfigurációs hiba?). Kérlek értesítsd a bot adminisztrátorát.`);
             } else if (error.message.includes('timeout')) {
                  return message.reply(`❌ Hiba történt a **${TARGET_SERVICE_NAME}** állapotának lekérdezésekor. Az állapotjelző oldal túl lassan töltött be.`);
             }
            return message.reply(`❌ Hiba történt a **${TARGET_SERVICE_NAME}** állapotának lekérdezésekor. Próbáld újra később.`);
        }
    }

    // --- Event Announce Commands ---
    else if (EVENTS_CONFIG[command]) {
        const eventConfig = EVENTS_CONFIG[command];
        const { eventName } = eventConfig;
        let userIGN = null;

        // Fetch IGN from database
        const getIgnQuery = 'SELECT ign FROM user_igns WHERE user_id = $1;';
        try {
            const result = await pool.query(getIgnQuery, [userId]);
            if (result.rows.length > 0) {
                userIGN = result.rows[0].ign;
            } else {
                return message.reply(`Először állítsd be a játékbeli nevedet (IGN) a \`${PREFIX}addign [játékbeli neved]\` paranccsal, mielőtt eseményeket jelentesz.`);
            }
        } catch (err) {
            console.error(`Database Error fetching IGN for event command !${command}:`, err);
            return message.reply("❌ Hiba történt a játékbeli neved (IGN) ellenőrzésekor. Próbáld újra később.");
        }

        // Find the role to ping
        const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === EVENT_ROLE_NAME.toLowerCase());
        if (!role) {
            console.error(`Configuration Error: Role "${EVENT_ROLE_NAME}" not found on server "${message.guild.name}" for command "!${command}"`);
            return message.reply(`❌ Hiba: A "${EVENT_ROLE_NAME}" szerepkör nem található ezen a szerveren. Kérlek kérdezd meg az adminisztrátort, hogy ellenőrizze a szerepkör nevét a bot konfigurációjában, vagy hozza létre a szerepkört.`);
        }

        // Send notification message
        const notification = `Figyelem, <@&${role.id}>! ${message.author} szerverén éppen a **${eventName}** esemény aktív!\nA játékbeli neve: **${userIGN}**. Nyugodtan csatlakozz hozzá!`;
        try {
            await message.channel.send(notification);
            console.log(`Sent notification for ${eventName} triggered by ${message.author.tag}`);
        } catch (error) {
            console.error(`Discord API Error sending event notification for ${eventName}:`, error);
            message.reply("❌ Sajnálom, nem tudtam elküldeni az értesítést. Kérlek ellenőrizd a jogosultságaimat ebben a csatornában.");
        }
        return; // Explicit return after handling the command
    }

});

// --- Keep-Alive Function ---
// Pings the Render service URL to prevent sleeping on free tiers
function keepAlive() {
    const url = process.env.RENDER_EXTERNAL_URL; // Get the Render URL from environment
    if (url) {
        console.log(`Setting up keep-alive pings to ${url}`);
        setInterval(async () => {
            try {
                // Use dynamic import for node-fetch
                const fetch = (await import('node-fetch')).default;
                const response = await fetch(url);
                if (!response.ok) {
                    // Log only if the ping fails
                    console.error(`Keep-alive ping failed to ${url}. Status code: ${response.status}`);
                }
            } catch (err) {
                console.error(`Error during keep-alive ping to ${url}:`, err);
            }
        }, 10 * 60 * 1000); // Ping every 10 minutes (adjust as needed)
    } else {
        console.warn('RENDER_EXTERNAL_URL is not set. Keep-alive pings are disabled.');
    }
}

// --- Login and Server Setup ---
const token = process.env.DISCORD_TOKEN;
const dbUrl = process.env.DATABASE_URL;
const port = process.env.PORT || 8080; // Render sets the PORT environment variable

// Validate essential configuration
if (!token) {
    console.error("FATAL ERROR: DISCORD_TOKEN environment variable not found.");
    process.exit(1);
}
if (!dbUrl) {
    console.error("FATAL ERROR: DATABASE_URL environment variable not found.");
    process.exit(1);
}

// Basic HTTP server for Render health checks
// Responds with 200 OK to any request
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
