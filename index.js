// Import necessary modules
const { Client, GatewayIntentBits, Partials, InteractionType, Events } = require('discord.js'); // Added InteractionType, Events
const { Pool } = require('pg');
require('dotenv').config();
const http = require('http');

// --- Configuration ---
// REMOVED: const PREFIX = '!'; // Prefix is no longer needed
const EVENT_ROLE_NAME = 'Eventek'; // Make sure this matches the exact role name (case-sensitive)
const EVENTS_CONFIG = { // Keep this config for event details and autocomplete
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
// Export for deploy-commands.js if needed there, otherwise keep internal
module.exports = { EVENTS_CONFIG }; // Exporting for deploy-commands

// --- Database Setup ---
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    console.error("FATAL ERROR: DATABASE_URL environment variable not found.");
    process.exit(1);
}
const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
});
pool.on('error', (err, client) => {
    console.error('Unexpected error on idle database client', err);
});

// --- Function to ensure the database table exists ---
// (Keep ensureTableExists function exactly as it was in the previous version)
async function ensureTableExists() {
    let client;
    try {
        console.log("Attempting to connect to the database...");
        client = await pool.connect();
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
        console.error("Error during database setup (ensureTableExists):", err);
        if (err.message.includes('terminat')) {
             console.error("Detail: The connection was terminated. Check DB server status, network access, and DATABASE_URL.");
        } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
             console.error("Detail: Could not resolve or connect to the database host. Verify the hostname and port in DATABASE_URL.");
        } else if (err.message.includes('password authentication failed')) {
             console.error("Detail: Database authentication failed. Verify the username and password in DATABASE_URL.");
        }
        throw new Error(`Could not ensure database table 'user_igns' exists: ${err.message}`);
    } finally {
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
        // GatewayIntentBits.GuildMessages, // Less crucial now, interactions are primary
        // GatewayIntentBits.MessageContent, // Not needed for slash commands
        GatewayIntentBits.GuildMembers, // Still useful for getting member info if needed
    ],
    partials: [Partials.Channel], // Partials might be less needed now
});

// --- Bot Event Handlers ---

client.once(Events.ClientReady, async c => { // Use ClientReady event once
    console.log(`Logged in as ${c.user.tag}!`);
    try {
        await ensureTableExists();
        console.log(`Bot is ready and listening for interactions.`);
        keepAlive();
    } catch (error) {
        console.error("FATAL: Bot readiness routine failed due to database setup error:", error);
        process.exit(1);
    }
});

// --- Interaction Handler ---
client.on(Events.InteractionCreate, async interaction => {
    // --- Autocomplete Handler ---
    if (interaction.isAutocomplete()) {
        const commandName = interaction.commandName;

        if (commandName === '76event') {
            const focusedOption = interaction.options.getFocused(true); // Get the option the user is typing in
            const focusedValue = focusedOption.value.toLowerCase();

            if (focusedOption.name === 'name') {
                // Filter event names based on user input
                const filteredChoices = Object.entries(EVENTS_CONFIG)
                    .map(([key, config]) => ({ name: config.eventName, value: key })) // Map to {name, value}
                    .filter(choice => choice.name.toLowerCase().includes(focusedValue))
                    .slice(0, 25); // Discord limits choices to 25

                try {
                    await interaction.respond(filteredChoices);
                } catch (error) {
                    console.error(`Error responding to autocomplete for /event:`, error);
                }
            }
        }
        return; // Stop processing if it's autocomplete
    }

    // --- Slash Command Handler ---
    if (!interaction.isChatInputCommand()) return; // Only handle slash commands

    const commandName = interaction.commandName;
    const userId = interaction.user.id; // Get user ID from interaction

    // Defer reply for potentially long operations (like DB queries)
    // Use ephemeral: true if only the user should see the reply
    // await interaction.deferReply({ ephemeral: false }); // Use if needed

    try {
        // --- Command Logic ---
        if (commandName === 'addign') {
            const ign = interaction.options.getString('ign', true); // Get required string option

            const query = `
                INSERT INTO user_igns (user_id, ign) VALUES ($1, $2)
                ON CONFLICT (user_id) DO UPDATE SET ign = EXCLUDED.ign, last_updated = CURRENT_TIMESTAMP;
            `;
            const values = [userId, ign];

            await pool.query(query, values);
            console.log(`Database: Added/Updated IGN for ${interaction.user.tag}: ${ign}`);
            // Use interaction.reply instead of message.reply
            await interaction.reply({ content: `✅ A játékbeli neved (IGN) sikeresen hozzá lett adva/frissítve lett erre: **${ign}**`, ephemeral: true }); // Ephemeral: only user sees it

        } else if (commandName === 'myign') {
            const query = 'SELECT ign FROM user_igns WHERE user_id = $1;';
            const values = [userId];
            const result = await pool.query(query, values);

            if (result.rows.length > 0) {
                const userIGN = result.rows[0].ign;
                await interaction.reply({ content: `A regisztrált játékbeli neved (IGN): **${userIGN}**`, ephemeral: true });
            } else {
                await interaction.reply({ content: `Még nem adtál meg játékbeli nevet (IGN). Használd a \`/addign [játékbeli neved]\` parancsot a hozzáadáshoz.`, ephemeral: true });
            }

        } else if (commandName === 'removeign') {
            const query = 'DELETE FROM user_igns WHERE user_id = $1;';
            const values = [userId];
            const result = await pool.query(query, values);

            if (result.rowCount > 0) {
                console.log(`Database: Removed IGN for ${interaction.user.tag}`);
                await interaction.reply({ content: "✅ A játékbeli neved (IGN) eltávolítva.", ephemeral: true });
            } else {
                await interaction.reply({ content: "Jelenleg nincs játékbeli neved (IGN) regisztrálva, amit eltávolíthatnál.", ephemeral: true });
            }

        } else if (commandName === 'status') {
            // Send a link to the game server status page
            await interaction.reply({ content: "🔗 [Ellenőrizd a Fallout 76 szerverek állapotát itt!](https://status.bethesda.net/)", ephemeral: true });
        } else if (commandName === '76event') {
            const eventKey = interaction.options.getString('name', true); // Get the chosen event key (value from autocomplete)
            const eventConfig = EVENTS_CONFIG[eventKey];

            if (!eventConfig) {
                // Should not happen with autocomplete, but good failsafe
                console.error(`Invalid event key "${eventKey}" received for /event command.`);
                await interaction.reply({ content: "❌ Hiba: Érvénytelen esemény lett kiválasztva.", ephemeral: true });
                return;
            }
            const { eventName } = eventConfig;

            // 1. Get User's IGN
            let userIGN = null;
            const getIgnQuery = 'SELECT ign FROM user_igns WHERE user_id = $1;';
            const getIgnValues = [userId];
            const ignResult = await pool.query(getIgnQuery, getIgnValues);

            if (ignResult.rows.length > 0) {
                userIGN = ignResult.rows[0].ign;
            } else {
                await interaction.reply({ content: `Először állítsd be a játékbeli nevedet (IGN) a \`/addign [játékbeli neved]\` paranccsal, mielőtt eseményeket jelentesz.`, ephemeral: true });
                return; // Stop processing
            }

            // 2. Find Role (Ensure guild context)
            if (!interaction.inGuild()) {
                 await interaction.reply({ content: "Ezt a parancsot csak szerveren belül lehet használni.", ephemeral: true });
                 return;
            }
            const role = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === EVENT_ROLE_NAME.toLowerCase());

            if (!role) {
                console.error(`Configuration Error: Role "${EVENT_ROLE_NAME}" not found on server "${interaction.guild.name}" for command "/event"`);
                await interaction.reply({ content: `❌ Hiba: A "${EVENT_ROLE_NAME}" szerepkör nem található ezen a szerveren. Kérlek kérdezd meg az adminisztrátort, hogy ellenőrizze a szerepkör nevét a bot konfigurációjában, vagy hozza létre a szerepkört.`, ephemeral: true });
                return;
            }

            // 3. Send Notification (in the channel the command was used)
            const notification = `Figyelem, <@&${role.id}>! ${interaction.user} szerverén éppen a **${eventName}** esemény aktív!\nA játékbeli neve: **${userIGN}**. Nyugodtan csatlakozz hozzá!`;

            try {
                 // First reply to the interaction to acknowledge it
                 await interaction.reply({ content: `✅ Értesítés elküldve a(z) **${eventName}** eseményről!`, ephemeral: true });
                 // Then send the public notification in the same channel
                 await interaction.channel.send(notification);
                 console.log(`Sent notification for ${eventName} triggered by ${interaction.user.tag} (IGN: ${userIGN})`);
            } catch (sendError) {
                 console.error(`Discord API Error sending event notification for ${eventName}:`, sendError);
                 // Try to follow up if the initial reply worked but send failed
                 await interaction.followUp({ content: "❌ Sajnálom, nem tudtam elküldeni a nyilvános értesítést. Kérlek ellenőrizd a jogosultságaimat ebben a csatornában.", ephemeral: true }).catch(console.error);
            }
        }

    } catch (error) {
        console.error(`Error handling interaction "${interaction.commandName}":`, error);
        // Try to reply or follow up with an error message
        const errorMessage = "❌ Hiba történt a parancs végrehajtása közben.";
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        } catch (replyError) {
            console.error('Failed to send error reply to interaction:', replyError);
        }
    }
});


// --- Keep-Alive Function ---
// (Keep keepAlive function exactly as it was in the previous version)
function keepAlive() {
    const url = process.env.RENDER_EXTERNAL_URL;
    if (url) {
        console.log(`Setting up keep-alive pings to ${url}`);
        setInterval(async () => {
            try {
                const fetch = (await import('node-fetch')).default;
                const response = await fetch(url);
                if (!response.ok) {
                    console.error(`Keep-alive ping FAILED to ${url}. Status: ${response.status} ${response.statusText} at ${new Date().toISOString()}`);
                }
            } catch (err) {
                console.error(`Error during keep-alive ping to ${url}:`, err);
            }
        }, 5 * 60 * 1000);
    } else {
        console.warn('RENDER_EXTERNAL_URL is not set. Keep-alive pings are disabled.');
    }
}

// --- Basic HTTP Server for Health Checks ---
// (Keep HTTP server exactly as it was in the previous version)
const port = process.env.PORT || 8080;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
}).listen(port, () => {
    console.log(`HTTP server listening on port ${port} for health checks.`);
});


// --- Login to Discord ---
const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error("FATAL ERROR: DISCORD_TOKEN environment variable not found.");
    process.exit(1);
}
client.login(token).catch(error => {
    console.error("FATAL ERROR: Failed to login to Discord:", error);
    process.exit(1);
});

// --- Graceful Shutdown ---
// (Keep Graceful Shutdown handlers exactly as they were)
process.on('SIGINT', async () => {
    console.log('Received SIGINT. Shutting down gracefully...');
    await client.destroy();
    await pool.end();
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
