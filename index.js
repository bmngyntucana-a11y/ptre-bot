import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_NAME = 'monitorar-alvos';

const PTRE_TEAM_KEY = 'wo-dmah-slfa-9kmn-8u63';
const PTRE_COUNTRY = 'br';
const PTRE_UNIVERSE = '178';
const PTRE_VERSION = '0.15.1';

client.once('ready', () => {
  console.log(`Bot online: ${client.user.tag}`);
});

function extractPlayerID(player) {
  const match = player.match(/\((\d+)\)/);
  return match ? parseInt(match[1], 10) : 0;
}

function parsePtreActivities(content) {
  const lines = content.split('\n');
  const map = new Map();

  for (const line of lines) {
    if (!line.startsWith('PTRE_ACTIVITY|')) continue;

    const parts = line.trim().split('|');
    if (parts.length < 7) continue;

    const player = parts[1];
    const coord = parts[2];
    const type = parts[3];
    const act = parseInt(parts[4], 10);
    const planetID = parseInt(parts[5], 10);
    const moonID = parseInt(parts[6], 10);
    const playerID = extractPlayerID(player);

    if (!map.has(coord)) {
      map.set(coord, {
        playerID: playerID,
        id: planetID,
        moonID: moonID,
        activity: 0,
        moonActivity: 0,
        coords: coord
      });
    }

    const item = map.get(coord);

    if (type === 'planet') item.activity = act;
    if (type === 'moon') item.moonActivity = act;
  }

  return Array.from(map.values());
}

client.on('messageCreate', async (message) => {
  try {
    if (!message.content) return;
    if (!message.channel) return;
    if (message.channel.name !== CHANNEL_NAME) return;
    if (message.author && message.author.id === client.user.id) return;

    const content = message.content.trim();
    if (!content.includes('PTRE_ACTIVITY|')) return;

    const activities = parsePtreActivities(content);
    if (activities.length === 0) return;

    const params = new URLSearchParams({
      tool: 'oglight',
      team_key: PTRE_TEAM_KEY,
      country: PTRE_COUNTRY,
      univers: PTRE_UNIVERSE,
      version: PTRE_VERSION
    });

    const url = `https://ptre.chez.gg/scripts/oglight_import_player_activity.php?${params.toString()}`;

    const form = new URLSearchParams();

    for (let i = 0; i < activities.length; i++) {
      const a = activities[i];

      form.append(`activities[${i}][playerID]`, String(a.playerID));
      form.append(`activities[${i}][id]`, String(a.id));
      form.append(`activities[${i}][moonID]`, String(a.moonID));
      form.append(`activities[${i}][activity]`, String(a.activity));
      form.append(`activities[${i}][moonActivity]`, String(a.moonActivity));
      form.append(`activities[${i}][coords]`, a.coords);
    }

    console.log('========================');
    console.log('RELATORIO RECEBIDO');
    console.log(content);
    console.log('ACTIVITIES ARRAY');
    console.log(JSON.stringify(activities, null, 2));
    console.log('FORM');
    console.log(form.toString());

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.toString()
    });

    const text = await response.text();

    console.log('RESPOSTA PTRE');
    console.log(text);
    console.log('========================');

  } catch (err) {
    console.error('ERRO GERAL');
    console.error(err);
  }
});

client.login(TOKEN);
