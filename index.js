import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;

client.once('ready', () => {
    console.log(`Bot online: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {

    if (message.author.bot) return;

    const content = message.content;

    console.log("RELATORIO RECEBIDO");
    console.log(content);

    if (!content.startsWith("PTRE_ACTIVITY|")) return;

    try {

        const lines = content.split('\n');

        const activities = [];

        for (const line of lines) {

            if (!line.startsWith("PTRE_ACTIVITY|")) continue;

            const parts = line.split('|');

            if (parts.length < 6) continue;

            const player = parts[1];
            const coord = parts[2];
            const type = parts[3];
            const activity = parseInt(parts[4]);
            const ids = parts[5];

            const coordParts = coord.split(':');

            activities.push({
                galaxy: parseInt(coordParts[0]),
                system: parseInt(coordParts[1]),
                position: parseInt(coordParts[2]),
                player: player,
                type: type,
                activity: activity,
                ids: ids
            });
        }

        console.log("======================");
        console.log("PTRE DATA");
        console.log(JSON.stringify(activities, null, 2));
        console.log("======================");

    } catch (err) {
        console.error(err);
    }
});

client.login(TOKEN);
