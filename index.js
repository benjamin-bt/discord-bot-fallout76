// Import necessary modules
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { Pool } = require('pg');
// Removed: const fetch = require('node-fetch'); // Don't require globally for v3+
require('dotenv').config();
const http = require('http'); // Import http for the server

// --- Configuration ---
const PREFIX = '!';
const EVENT_ROLE_NAME = 'Eventek'; // Make sure this matches the exact role name (case-sensitive)
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
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    console.error("FATAL ERROR: DATABASE_URL environment variable not found.");
    process.exit(1); // Exit if DB URL is missing
}

const pool = new Pool({
    connectionString: dbUrl,
    ssl: {
        rejectUnauthorized: false // Often required for cloud providers like Render/Heroku
    },
    // Optional: Add connection timeout (e.g., 10 seconds)
    // connectionTimeoutMillis: 10000,
    // Optional: Add statement timeout (e.g., 5 seconds)
    // statement_timeout: 5000,
});

pool.on('error', (err, client) => {
    // This catches errors on idle clients in the pool
    console.error('Unexpected error on idle database client', err);
    // Consider whether to exit the process depending on the error severity
    // process.exit(-1);
});

// --- Function to ensure the database table exists ---
async function ensureTableExists() {
    let client; // Define client outside the try block to access it in finally
    try {
        console.log("Attempting to connect to the database...");
        client = await pool.connect(); // Attempt to get a client from the pool
        console.log("Successfully connected to the database pool.");

        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS user_igns (
                user_id TEXT PRIMARY KEY,
                ign TEXT NOT NULL,
                last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `;
        console.log("Executing CREATE TABLE IF NOT EXISTS query...");
        await client.query(createTableQuery);
        console.log("Database table 'user_igns' is ready.");

    } catch (err) {
        // Log the specific error encountered
        console.error("Error during database setup (ensureTableExists):", err);
        if (err.message.includes('terminat')) {
             console.error("Detail: The connection was terminated. Check DB server status, network access, and DATABASE_URL.");
        } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
             console.error("Detail: Could not resolve or connect to the database host. Verify the hostname and port in DATABASE_URL.");
        } else if (err.message.includes('password authentication failed')) {
             console.error("Detail: Database authentication failed. Verify the username and password in DATABASE_URL.");
        }
        // Re-throw the error to be caught by the calling function (client.on('ready'))
        // This ensures the bot doesn't continue in a broken state.
        throw new Error(`Could not ensure database table 'user_igns' exists: ${err.message}`);

    } finally {
        // Ensure the client is released back to the pool if it was acquired
        if (client) {
            console.log("Releasing database client.");
            client.release();
        } else {
             console.log("Database client was not acquired, nothing to release.");
        }
    }
}

// --- Discord Client Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers, // Keep GuildMembers if you need member info beyond the message context
    ],
    partials: [Partials.Channel, Partials.Message], // Keep Partials if needed for older messages/DMs
});

// --- Bot Event Handlers ---

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    try {
        await ensureTableExists(); // Call the setup function
        console.log(`Bot is ready and listening for commands with prefix "${PREFIX}"`);
        // Start the keep-alive function *after* successful DB setup and login
        keepAlive();
    } catch (error) {
        // Catch the error thrown from ensureTableExists
        console.error("FATAL: Bot readiness routine failed due to database setup error:", error);
        // Exit the process because the bot cannot function without the database table
        process.exit(1);
    }
});

client.on('messageCreate', async (message) => {
    // Ignore bots, DMs, and messages without the prefix
    if (message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;

    // Parse command and arguments
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const userId = message.author.id;

    // --- Command Handling ---

    // !addign command
    if (command === 'addign') {
        const ign = args.join(' ');
        if (!ign) {
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
            await pool.query(query, values); // Use pool directly for queries
            console.log(`Database: Added/Updated IGN for ${message.author.tag}: ${ign}`);
            return message.reply(`✅ A játékbeli neved (IGN) sikeresen hozzá lett adva/frissítve lett erre: **${ign}**`);
        } catch (err) {
            console.error("Database Error during !addign:", err);
            return message.reply("❌ Hiba történt a játékbeli neved (IGN) mentésekor. Próbáld újra később.");
        }
    }

    // !myign command
    else if (command === 'myign') {
        const query = 'SELECT ign FROM user_igns WHERE user_id = $1;';
        const values = [userId];

        try {
            const result = await pool.query(query, values);
            if (result.rows.length > 0) {
                const userIGN = result.rows[0].ign;
                return message.reply(`A regisztrált játékbeli neved (IGN): **${userIGN}**`);
            } else {
                return message.reply(`Még nem adtál meg játékbeli nevet (IGN). Használd a \`${PREFIX}addign [játékbeli neved]\` parancsot a hozzáadáshoz.`);
            }
        } catch (err) {
            console.error("Database Error during !myign:", err);
            return message.reply("❌ Hiba történt a játékbeli neved (IGN) lekérdezésekor. Próbáld újra később.");
        }
    }

    // !removeign command
    else if (command === 'removeign') {
        const query = 'DELETE FROM user_igns WHERE user_id = $1;';
        const values = [userId];

        try {
            const result = await pool.query(query, values);
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

    // --- Event Announce Command ---
    else if (EVENTS_CONFIG[command]) {
        const eventConfig = EVENTS_CONFIG[command];
        const { eventName } = eventConfig;
        let userIGN = null;

        // 1. Get User's IGN from DB
        const getIgnQuery = 'SELECT ign FROM user_igns WHERE user_id = $1;';
        const getIgnValues = [userId];

        try {
            const result = await pool.query(getIgnQuery, getIgnValues);
            if (result.rows.length > 0) {
                userIGN = result.rows[0].ign;
            } else {
                // User hasn't set an IGN
                return message.reply(`Először állítsd be a játékbeli nevedet (IGN) a \`${PREFIX}addign [játékbeli neved]\` paranccsal, mielőtt eseményeket jelentesz.`);
            }
        } catch (err) {
            console.error(`Database Error fetching IGN for event command !${command}:`, err);
            return message.reply("❌ Hiba történt a játékbeli neved (IGN) ellenőrzésekor. Próbáld újra később.");
        }

        // 2. Find the Event Role
        const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === EVENT_ROLE_NAME.toLowerCase());

        if (!role) {
            console.error(`Configuration Error: Role "${EVENT_ROLE_NAME}" not found on server "${message.guild.name}" for command "!${command}"`);
            return message.reply(`❌ Hiba: A "${EVENT_ROLE_NAME}" szerepkör nem található ezen a szerveren. Kérlek kérdezd meg az adminisztrátort, hogy ellenőrizze a szerepkör nevét a bot konfigurációjában, vagy hozza létre a szerepkört.`);
        }

        // 3. Send Notification
        const notification = `Figyelem, <@&${role.id}>! ${message.author} szerverén éppen a **${eventName}** esemény aktív!\nA játékbeli neve: **${userIGN}**. Nyugodtan csatlakozz hozzá!`;

        try {
            await message.channel.send(notification);
            console.log(`Sent notification for ${eventName} triggered by ${message.author.tag} (IGN: ${userIGN})`);
            // Optional: Delete the triggering command message after success
            // await message.delete().catch(console.error);
        } catch (error) {
            console.error(`Discord API Error sending event notification for ${eventName}:`, error);
            // Inform the user if sending failed (e.g., permissions issue)
            message.reply("❌ Sajnálom, nem tudtam elküldeni az értesítést. Kérlek ellenőrizd a jogosultságaimat ebben a csatornában.").catch(console.error); // Catch potential error replying
        }
        return; // Stop further processing after handling the event command
    }

    // Optional: Handle unknown commands if needed
    // else {
    //  message.reply(`Ismeretlen parancs: \`${PREFIX}${command}\`.`);
    // }
});

// --- Keep-Alive Function ---
function keepAlive() {
    const url = process.env.RENDER_EXTERNAL_URL; // Get the Render URL
    if (url) {
        console.log(`Setting up keep-alive pings to ${url}`);
        setInterval(async () => {
            try {
                // Dynamically import node-fetch ONLY when needed
                const fetch = (await import('node-fetch')).default;
                const response = await fetch(url);
                if (response.ok) {
                    // Log less verbosely on success to keep logs cleaner
                    // console.log(`Pinged ${url} successfully at ${new Date().toISOString()}`);
                } else {
                    // Log errors clearly
                    console.error(`Keep-alive ping FAILED to ${url}. Status: ${response.status} ${response.statusText} at ${new Date().toISOString()}`);
                }
            } catch (err) {
                // Catch errors during import or fetch
                console.error(`Error during keep-alive ping to ${url}:`, err);
            }
        }, 5 * 60 * 1000); // Ping every 5 minutes
    } else {
        console.warn('RENDER_EXTERNAL_URL is not set. Keep-alive pings are disabled.');
    }
}


// --- Basic HTTP Server for Health Checks ---
const port = process.env.PORT || 8080; // Use Render's PORT or default
http.createServer((req, res) => {
    // Respond positively to any request (usually Render's health check)
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
}).listen(port, () => {
    // Log only after the server is actually listening
    console.log(`HTTP server listening on port ${port} for health checks.`);
});


// --- Login to Discord ---
const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error("FATAL ERROR: DISCORD_TOKEN environment variable not found.");
    process.exit(1); // Exit if token is missing
}

// Login to Discord AFTER setting up HTTP server and DB checks
client.login(token).then(() => {
    // This confirmation now happens only if DB setup succeeds (due to logic in 'ready' event)
    // console.log(`Successfully logged in to Discord as ${client.user.tag}`); // Moved to 'ready'
}).catch(error => {
    console.error("FATAL ERROR: Failed to login to Discord:", error);
    process.exit(1); // Exit if Discord login itself fails
});

// --- Graceful Shutdown (Optional but Recommended) ---
process.on('SIGINT', async () => {
    console.log('Received SIGINT. Shutting down gracefully...');
    await client.destroy(); // Close Discord connection
    await pool.end(); // Close database connections
    console.log('Shutdown complete.');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM. Shutting down gracefully...');
    await client.destroy();
    await pool.end();
    console.log('Shutdown complete.');
    process.exit(0);
});
