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

  const response = await fetch(PLAYERS_XML_URL);
  const xml = await response.text();

  const map = {};
  const regex = /<player\s+id="(\d+)"\s+name="([^"]+)"(?:\s+status="([^"]+)")?/g;

  let match;

  while ((match = regex.exec(xml)) !== null) {
    const id = parseInt(match[1], 10);
    const name = match[2];
    const status = match[3] || false;

    map[name.toLowerCase()] = { id, name, status };
  }

  playersCache = map;
  playersCacheTime = now;

  console.log(`Players carregados: ${Object.keys(playersCache).length}`);
  return playersCache;
}

function cleanPlayerName(rawName) {
  return rawName.replace(/\s*\(\d+\)\s*$/g, '').trim();
}

async function getPlayerInfoByName(playerNameRaw) {
  const players = await loadPlayersXml();
  const cleanName = cleanPlayerName(playerNameRaw);
  const info = players[cleanName.toLowerCase()];

  if (!info) {
    console.log(`ERRO: player_id não encontrado para ${cleanName}`);
    return null;
  }

  console.log(`PLAYER ID: ${cleanName} -> ${info.id}`);
  return info;
}

async function buildPtreData(content) {
  const lines = content.split('\n');

  const positionsData = {};
  const activitiesData = {};

  for (const line of lines) {
    if (!line.startsWith('PTRE_ACTIVITY|')) continue;

    const parts = line.trim().split('|');
    if (parts.length < 7) continue;

    const playerNameRaw = parts[1];
    const coord = parts[2];
    const type = parts[3];
    const activity = parseInt(parts[4], 10);
    const planetID = parseInt(parts[5], 10);
    const moonID = parseInt(parts[6], 10);

    const playerInfo = await getPlayerInfoByName(playerNameRaw);
    if (!playerInfo) continue;

    const [galaxy, system, position] = coord.split(':').map(Number);

    if (!positionsData[coord]) {
      positionsData[coord] = {
        id: planetID,
        player_id: playerInfo.id,
        name: playerInfo.name,
        rank: -1,
        score: -1,
        fleet: -1,
        status: playerInfo.status || false
      };

      if (moonID && moonID > 0) {
        positionsData[coord].moon = {
          id: moonID,
          size: -1
        };
      }
    }

    if (!activitiesData[coord]) {
      activitiesData[coord] = {
        id: planetID,
        player_id: playerInfo.id,
        teamkey: PTRE_TEAM_KEY,
        mv: playerInfo.status && String(playerInfo.status).includes('v'),
        activity: 0,
        galaxy,
        system,
        position,
        main: false,
        cdr_total_size: 0
      };

      if (moonID && moonID > 0) {
        activitiesData[coord].moon = {
          id: moonID,
          activity: 0
        };
      }
    }

    if (type === 'planet') {
      activitiesData[coord].activity = activity;
    }

    if (type === 'moon') {
      if (!activitiesData[coord].moon) {
        activitiesData[coord].moon = {
          id: moonID,
          activity: 0
        };
      }

      activitiesData[coord].moon.activity = activity;
    }
  }

  return { positionsData, activitiesData };
}

function makeUrl(endpoint) {
  const params = new URLSearchParams({
    tool: 'oglight',
    team_key: PTRE_TEAM_KEY,
    country: PTRE_COUNTRY,
    univers: PTRE_UNIVERSE,
    version: PTRE_VERSION
  });

  return `https://ptre.chez.gg/scripts/${endpoint}?${params.toString()}`;
}

async function sendJsonToPtre(endpoint, data) {
  const url = makeUrl(endpoint);

  console.log('========================');
  console.log(`ENVIANDO PARA ${endpoint}`);
  console.log(JSON.stringify(data, null, 2));
  console.log('URL');
  console.log(url);

  const response = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(data)
  });

  const text = await response.text();

  console.log('RESPOSTA');
  console.log(text);
  console.log('========================');

  return text;
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

    const { positionsData, activitiesData } = await buildPtreData(content);

    if (Object.keys(activitiesData).length === 0) {
      console.log('Nenhum dado válido para enviar ao PTRE.');
      return;
    }

    if (Object.keys(positionsData).length > 0) {
      await sendJsonToPtre('api_galaxy_import_infos.php', positionsData);
    }

    await sendJsonToPtre('oglight_import_player_activity.php', activitiesData);

  } catch (err) {
    console.error('========================');
    console.error('ERRO GERAL');
    console.error(err);
    console.error('========================');
  }
});

client.login(TOKEN);
