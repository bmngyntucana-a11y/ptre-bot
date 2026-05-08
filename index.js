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

const PLAYERS_XML_URL = 'https://s178-br.ogame.gameforge.com/api/players.xml';

let playersCache = {};
let playersCacheTime = 0;
const CACHE_DURATION = 6 * 60 * 60 * 1000;

client.once('ready', () => {
  console.log(`Bot online: ${client.user.tag}`);
});

async function loadPlayersXml() {
  const now = Date.now();

  if (Object.keys(playersCache).length > 0 && now - playersCacheTime < CACHE_DURATION) {
    return playersCache;
  }

  console.log('Baixando players.xml...');

  const response = await fetch(PLAYERS_XML_URL);
  const xml = await response.text();

  const map = {};
  const regex = /<player\s+id="(\d+)"\s+name="([^"]+)"/g;

  let match;

  while ((match = regex.exec(xml)) !== null) {
    const id = parseInt(match[1], 10);
    const name = match[2];

    map[name.toLowerCase()] = id;
  }

  playersCache = map;
  playersCacheTime = now;

  console.log(`Players carregados: ${Object.keys(playersCache).length}`);

  return playersCache;
}

function cleanPlayerName(rawName) {
  return rawName
    .replace(/\s*\(\d+\)\s*$/g, '')
    .trim();
}

async function getPlayerIdByName(playerName) {
  const players = await loadPlayersXml();

  const cleanName = cleanPlayerName(playerName);
  const id = players[cleanName.toLowerCase()];

  if (!id) {
    console.log(`ERRO: player_id não encontrado para: ${playerName}`);
    return 0;
  }

  console.log(`PLAYER ID encontrado: ${cleanName} -> ${id}`);
  return id;
}

async function parseActivities(content) {
  const lines = content.split('\n');
  const map = new Map();

  for (const line of lines) {
    if (!line.startsWith('PTRE_ACTIVITY|')) continue;

    const parts = line.trim().split('|');

    if (parts.length < 7) continue;

    const playerNameRaw = parts[1];
    const coord = parts[2];
    const type = parts[3];
    const act = parseInt(parts[4], 10);
    const planetID = parseInt(parts[5], 10);
    const moonID = parseInt(parts[6], 10);

    const playerID = await getPlayerIdByName(playerNameRaw);

    if (!playerID) continue;

    const [galaxy, system, position] = coord.split(':').map(Number);

    if (!map.has(coord)) {
      map.set(coord, {
        id: planetID,
        player_id: playerID,
        teamkey: PTRE_TEAM_KEY,
        mv: false,
        activity: 0,
        galaxy: galaxy,
        system: system,
        position: position,
        main: false,
        cdr_total_size: 0
      });

      if (moonID && moonID > 0) {
        map.get(coord).moon = {
          id: moonID,
          activity: 0
        };
      }
    }

    const item = map.get(coord);

    if (type === 'planet') {
      item.activity = act;
    }

    if (type === 'moon') {
      if (!item.moon) {
        item.moon = {
          id: moonID,
          activity: 0
        };
      }

      item.moon.activity = act;
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

    console.log('========================');
    console.log('RELATORIO RECEBIDO');
    console.log(content);

    const activities = await parseActivities(content);

    if (activities.length === 0) {
      console.log('Nenhuma atividade válida para enviar ao PTRE.');
      return;
    }

    const finalPayload = {
      activities: activities
    };

    const params = new URLSearchParams({
      tool: 'oglight',
      team_key: PTRE_TEAM_KEY,
      country: PTRE_COUNTRY,
      univers: PTRE_UNIVERSE,
      version: PTRE_VERSION
    });

    const url = `https://ptre.chez.gg/scripts/oglight_import_player_activity.php?${params.toString()}`;

    console.log('========================');
    console.log('PAYLOAD FINAL');
    console.log(JSON.stringify(finalPayload, null, 2));

    console.log('========================');
    console.log('URL');
    console.log(url);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(finalPayload)
    });

    const text = await response.text();

    console.log('========================');
    console.log('RESPOSTA PTRE');
    console.log(text);
    console.log('========================');

  } catch (err) {
    console.error('========================');
    console.error('ERRO GERAL');
    console.error(err);
    console.error('========================');
  }
});

client.login(TOKEN);
