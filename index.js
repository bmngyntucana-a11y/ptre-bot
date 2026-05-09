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

function cleanPlayerName(rawName) {
  return rawName.replace(/\s*\(\d+\)\s*$/g, '').trim();
}

async function loadPlayersXml() {
  const now = Date.now();

  if (Object.keys(playersCache).length > 0 && now - playersCacheTime < CACHE_DURATION) {
    return playersCache;
  }

  console.log('Baixando players.xml...');

  const response = await fetch(PLAYERS_XML_URL);
  const xml = await response.text();

  const map = {};
  const regex = /<player\s+([^>]+)>/g;

  let match;

  while ((match = regex.exec(xml)) !== null) {
    const attrs = match[1];

    const idMatch = attrs.match(/id="(\d+)"/);
    const nameMatch = attrs.match(/name="([^"]+)"/);
    const statusMatch = attrs.match(/status="([^"]+)"/);
    const allianceMatch = attrs.match(/alliance="(\d+)"/);

    if (!idMatch || !nameMatch) continue;

    const id = parseInt(idMatch[1], 10);
    const name = nameMatch[1];

    map[name.toLowerCase()] = {
      id: id,
      name: name,
      status: statusMatch ? statusMatch[1] : false,
      alliance: allianceMatch ? parseInt(allianceMatch[1], 10) : -1
    };
  }

  playersCache = map;
  playersCacheTime = now;

  console.log(`Players carregados: ${Object.keys(playersCache).length}`);

  return playersCache;
}

async function getPlayerInfoByName(rawName) {
  const cleanName = cleanPlayerName(rawName);
  const players = await loadPlayersXml();
  const info = players[cleanName.toLowerCase()];

  if (!info) {
    console.log(`ERRO: player_id não encontrado para ${cleanName}`);
    return null;
  }

  console.log(`PLAYER ID encontrado: ${cleanName} -> ${info.id}`);

  return info;
}

function ptreUrl(endpoint) {
  const params = new URLSearchParams({
    tool: 'oglight',
    team_key: PTRE_TEAM_KEY,
    country: PTRE_COUNTRY,
    univers: PTRE_UNIVERSE,
    version: PTRE_VERSION
  });

  return `https://ptre.chez.gg/scripts/${endpoint}?${params.toString()}`;
}

async function sendToPtre(endpoint, payload) {
  const url = ptreUrl(endpoint);

  console.log('========================');
  console.log(`ENVIANDO PARA ${endpoint}`);
  console.log(JSON.stringify(payload, null, 2));
  console.log('URL');
  console.log(url);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();

  console.log('RESPOSTA PTRE');
  console.log(text);
  console.log('========================');

  return text;
}

async function buildPtrePayloads(content) {
  const lines = content.split('\n');

  const positionsData = {};
  const activitiesData = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line.startsWith('PTRE_ACTIVITY|')) continue;

    const parts = line.split('|');

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

    const now = Date.now();

    if (!positionsData[coord]) {
      positionsData[coord] = {
        teamkey: PTRE_TEAM_KEY,

        galaxy: galaxy,
        system: system,
        position: position,

        timestamp_ig: now,

        old_player_id: -1,
        timestamp_api: -1,
        old_name: false,
        old_rank: -1,
        old_score: -1,
        old_fleet: -1,

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
        mv: playerInfo.status && String(playerInfo.status).includes('v') ? true : false,
        activity: 0,

        galaxy: galaxy,
        system: system,
        position: position,

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

  return {
    positionsData,
    activitiesData
  };
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
    console.log('========================');

    const { positionsData, activitiesData } = await buildPtrePayloads(content);

    const positionsCount = Object.keys(positionsData).length;
    const activitiesCount = Object.keys(activitiesData).length;

    console.log(`positionsData: ${positionsCount}`);
    console.log(`activitiesData: ${activitiesCount}`);

    if (activitiesCount === 0) {
      console.log('Nenhuma atividade válida para enviar.');
      return;
    }

    if (positionsCount > 0) {
      await sendToPtre('api_galaxy_import_infos.php', positionsData);
    }

    await sendToPtre('oglight_import_player_activity.php', activitiesData);

  } catch (err) {
    console.error('========================');
    console.error('ERRO GERAL');
    console.error(err);
    console.error('========================');
  }
});

client.login(TOKEN);
