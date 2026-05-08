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

const PTRE_TEAM_KEY = 'TM-GDID-6GU7-ZXAW-OGEN';
const PTRE_COUNTRY = 'br';
const PTRE_UNIVERSE = '178';
const PTRE_VERSION = '5.2.2';

client.once('ready', () => {
  console.log(`Bot online: ${client.user.tag}`);
});

function extractPlayerID(player) {
  const match = player.match(/\((\d+)\)/);
  return match ? parseInt(match[1], 10) : 0;
}

function parseOglightFormat(content) {
  const lines = content.split('\n');
  const postData = {};

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

    const [galaxy, system, position] = coord.split(':').map(Number);

    if (!postData[coord]) {
      postData[coord] = {
        id: planetID,
        player_id: playerID,
        teamkey: PTRE_TEAM_KEY,
        mv: false,
        activity: 0,
        galaxy,
        system,
        position,
        main: false,
        cdr_total_size: 0
      };

      if (moonID && moonID > 0) {
        postData[coord].moon = {
          id: moonID,
          activity: 0
        };
      }
    }

    if (type === 'planet') {
      postData[coord].activity = act;
    }

    if (type === 'moon') {
      if (!postData[coord].moon) {
        postData[coord].moon = {
          id: moonID,
          activity: 0
        };
      }
      postData[coord].moon.activity = act;
    }
  }

  return postData;
}

client.on('messageCreate', async (message) => {
  try {
    if (!message.content) return;
    if (!message.channel) return;
    if (message.channel.name !== CHANNEL_NAME) return;
    if (message.author && message.author.id === client.user.id) return;

    const content = message.content.trim();
    if (!content.includes('PTRE_ACTIVITY|')) return;

    const postData = parseOglightFormat(content);
    if (Object.keys(postData).length === 0) return;

    const params = new URLSearchParams({
      tool: 'oglight',
      team_key: PTRE_TEAM_KEY,
      country: PTRE_COUNTRY,
      univers: PTRE_UNIVERSE,
      version: PTRE_VERSION
    });

    const url = `https://ptre.chez.gg/scripts/oglight_import_player_activity.php?${params.toString()}`;

    console.log('========================');
    console.log('POSTDATA OGLIGHT');
    console.log(JSON.stringify(postData, null, 2));
    console.log('URL');
    console.log(url);

    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(postData)
    });

    const data = await response.text();

    console.log('RESPOSTA PTRE');
    console.log(data);
    console.log('========================');

  } catch (err) {
    console.error('ERRO GERAL');
    console.error(err);
  }
});

client.login(TOKEN);
