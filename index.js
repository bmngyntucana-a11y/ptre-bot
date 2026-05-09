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
      id,
      name,
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
  const players = await loadPlayersXml();
  const cleanName = cleanPlayerName(rawName);
  const info = players[cleanName.toLowerCase()];

  if (!info) {
    console.log(`Player não encontrado no XML: ${cleanName}`);
    return null;
  }

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
  const count = Array.isArray(payload) ? payload.length : Object.keys(payload).length;

  console.log(`Enviando ${count} entradas para ${endpoint}`);

  const response = await fetch(ptreUrl(endpoint), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();

  console.log(`Resposta ${endpoint}: ${text}`);

  return text;
}

async function buildPtrePayloads(content) {
  const lines = content.split('\n');

  const positionsData = [];
  const activitiesData = [];

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

    let positionEntry = positionsData.find(
      p => p.galaxy === galaxy &&
           p.system === system &&
           p.position === position
    );

    if (!positionEntry) {
      positionEntry = {
        teamkey: PTRE_TEAM_KEY,

        galaxy,
        system,
        position,

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
        positionEntry.moon = {
          id: moonID,
          size: -1
        };
      }

      positionsData.push(positionEntry);
    }

    let activityEntry = activitiesData.find(
      p => p.galaxy === galaxy &&
           p.system === system &&
           p.position === position
    );

    if (!activityEntry) {
      activityEntry = {
        id: planetID,
        player_id: playerInfo.id,
        teamkey: PTRE_TEAM_KEY,
        mv: playerInfo.status && String(playerInfo.status).includes('v') ? true : false,
        activity: 0,

        galaxy,
        system,
        position,

        main: false,
        cdr_total_size: 0
      };

      if (moonID && moonID > 0) {
        activityEntry.moon = {
          id: moonID,
          activity: 0
        };
      }

      activitiesData.push(activityEntry);
    }

    if (type === 'planet') {
      activityEntry.activity = activity;
    }

    if (type === 'moon') {
      if (!activityEntry.moon) {
        activityEntry.moon = {
          id: moonID,
          activity: 0
        };
      }

      activityEntry.moon.activity = activity;
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

    const { positionsData, activitiesData } = await buildPtrePayloads(content);

    console.log(`Relatório recebido: positions=${positionsData.length}, activities=${activitiesData.length}`);

    if (positionsData.length > 0) {
      await sendToPtre('api_galaxy_import_infos.php', positionsData);
    }

    if (activitiesData.length > 0) {
      await sendToPtre('oglight_import_player_activity.php', activitiesData);
    }

  } catch (err) {
    console.error('ERRO GERAL:', err);
  }
});

client.login(TOKEN);
