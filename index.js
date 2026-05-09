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

function toOglightActivity(value) {
  const n = parseInt(value, 10);

  if (Number.isNaN(n)) return 0;

  if (n > 0 && n <= 15) return '*';

  return n;
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

    if (!idMatch || !nameMatch) continue;

    const id = parseInt(idMatch[1], 10);
    const name = nameMatch[1];

    map[name.toLowerCase()] = {
      id,
      name,
      status: statusMatch ? statusMatch[1] : false
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

async function sendActivitiesToPtre(activitiesData) {
  const count = Object.keys(activitiesData).length;

  console.log(`Enviando ${count} entradas para oglight_import_player_activity.php`);

  const response = await fetch(ptreUrl('oglight_import_player_activity.php'), {
    method: 'POST',
    body: JSON.stringify(activitiesData)
  });

  const text = await response.text();

  console.log(`Resposta PTRE: ${text}`);

  return text;
}

async function buildActivitiesPayload(content) {
  const lines = content.split('\n');
  const activitiesData = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line.startsWith('PTRE_ACTIVITY|')) continue;

    const parts = line.split('|');

    if (parts.length < 7) continue;

    const playerNameRaw = parts[1];
    const coord = parts[2];
    const type = parts[3];
    const activityRaw = parts[4];
    const planetID = parseInt(parts[5], 10);
    const moonID = parseInt(parts[6], 10);

    const playerInfo = await getPlayerInfoByName(playerNameRaw);

    if (!playerInfo) continue;

    const [galaxy, system, position] = coord.split(':').map(Number);

    if (!activitiesData[coord]) {
      activitiesData[coord] = {
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
        activitiesData[coord].moon = {
          id: moonID,
          activity: 0
        };
      }
    }

    const oglActivity = toOglightActivity(activityRaw);

    if (type === 'planet') {
      activitiesData[coord].activity = oglActivity;
    }

    if (type === 'moon') {
      if (!activitiesData[coord].moon) {
        activitiesData[coord].moon = {
          id: moonID,
          activity: 0
        };
      }

      activitiesData[coord].moon.activity = oglActivity;
    }
  }

  return activitiesData;
}

client.on('messageCreate', async (message) => {
  try {
    if (!message.content) return;
    if (!message.channel) return;
    if (message.channel.name !== CHANNEL_NAME) return;
    if (message.author && message.author.id === client.user.id) return;

    const content = message.content.trim();

    if (!content.includes('PTRE_ACTIVITY|')) return;

    const activitiesData = await buildActivitiesPayload(content);
    const activitiesCount = Object.keys(activitiesData).length;

    console.log(`Relatório recebido: activities=${activitiesCount}`);

    if (activitiesCount === 0) {
      console.log('Nenhuma atividade válida para enviar.');
      return;
    }

    await sendActivitiesToPtre(activitiesData);

  } catch (err) {
    console.error('ERRO GERAL:', err);
  }
});

client.login(TOKEN);
