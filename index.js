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
const PTRE_API_KEY = 'TM-GDID-6GU7-ZXAW-OGEN';
const PTRE_COUNTRY = 'br';
const PTRE_UNIVERSE = '178';
const PTRE_VERSION = '0.15.1';

client.once('ready', () => {
  console.log(`Bot online: ${client.user.tag}`);
});

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
    const activity = parseInt(parts[4], 10);
    const planetID = parseInt(parts[5], 10);
    const moonID = parseInt(parts[6], 10);

    const [galaxy, system, position] = coord.split(':').map(Number);

    if (!map.has(coord)) {

      map.set(coord, {
        galaxy,
        system,
        position,

        coords: coord,

        player,
        player_name: player,

        id: planetID,
        planetID,
        id_planet: planetID,

        moonID,
        id_moon: moonID,

        activity: 0,
        moonActivity: 0
      });
    }

    const item = map.get(coord);

    if (type === 'planet') {
      item.activity = activity;
    }

    if (type === 'moon') {
      item.moonActivity = activity;
    }
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

    const positions = parsePtreActivities(content);

    if (positions.length === 0) {
      console.log('Sem posições válidas.');
      return;
    }

    console.log('========================');
    console.log('RELATORIO RECEBIDO');
    console.log(content);

    console.log('========================');
    console.log('POSITIONS');
    console.log(JSON.stringify(positions, null, 2));

    const params = new URLSearchParams({
      tool: 'oglight',
      team_key: PTRE_TEAM_KEY,
      country: PTRE_COUNTRY,
      univers: PTRE_UNIVERSE,
      version: PTRE_VERSION
    });

    const url =
      `https://ptre.chez.gg/scripts/oglight_import_player_activity.php?${params.toString()}`;

    const form = new URLSearchParams();

    form.append('team_key', PTRE_TEAM_KEY);
    form.append('api_key', PTRE_API_KEY);
    form.append('activities', JSON.stringify(positions));

    console.log('========================');
    console.log('URL PTRE');
    console.log(url);

    console.log('========================');
    console.log('FORM PTRE');
    console.log(form.toString());

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.toString()
    });

    const text = await response.text();

    console.log('========================');
    console.log('RESPOSTA PTRE');
    console.log(text);
    console.log('========================');

  } catch (err) {

    console.error('ERRO GERAL');
    console.error(err);
  }
});

client.login(TOKEN);
