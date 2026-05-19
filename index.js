import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TOKEN = process.env.DISCORD_TOKEN;

// Canal onde chegam as mensagens PTRE_SCAN e PTRE_ACTIVITY
const CHANNEL_NAME = process.env.CHANNEL_NAME || 'scaner-ptre';

// Team key do PTRE
const PTRE_TEAM_KEY = process.env.PTRE_TEAM_KEY || 'TM-J8DN-RKYM-01TN-BETS';

// Universo correto: Regulus.en / s273-en
const COUNTRY = process.env.PTRE_COUNTRY || 'en';
const UNIVERSE = process.env.PTRE_UNIVERSE || '273';

const VERSION = process.env.PTRE_VERSION || '5.2.2';

// players.xml correto do universo s273-en
const PLAYERS_XML = process.env.PLAYERS_XML || 'https://s273-en.ogame.gameforge.com/api/players.xml';

let players = {};
let playersLoaded = false;

client.once('ready', async () => {
  console.log(`Bot online: ${client.user.tag}`);
  console.log(`Canal monitorado: ${CHANNEL_NAME}`);
  console.log(`PTRE universo: ${COUNTRY}-${UNIVERSE}`);
  console.log(`Players XML: ${PLAYERS_XML}`);
  await loadPlayers();
});

async function loadPlayers() {
  try {
    console.log('Baixando players.xml...');

    const res = await fetch(PLAYERS_XML);

    if (!res.ok) {
      throw new Error(`Erro HTTP ao baixar players.xml: ${res.status}`);
    }

    const xml = await res.text();

    const regex = /<player id="(\d+)" name="([^"]+)"/g;
    let match;

    players = {};

    while ((match = regex.exec(xml)) !== null) {
      const id = parseInt(match[1], 10);
      const name = match[2];

      players[name.toLowerCase()] = id;
    }

    playersLoaded = true;
    console.log(`Players carregados: ${Object.keys(players).length}`);
  } catch (e) {
    playersLoaded = false;
    console.error('Erro players.xml:', e);
  }
}

function cleanPlayerName(rawName) {
  return rawName.replace(/\s*\(\d+\)\s*$/g, '').trim();
}

function activityValue(v) {
  const n = parseInt(v, 10);

  if (isNaN(n)) return 60;
  if (n <= 0) return 60;

  // O PTRE/OGLight aceita "*" para atividade recente
  if (n > 0 && n <= 15) return '*';

  if (n > 60) return 60;

  return n;
}

function extractCdr(parts) {
  const cdrIndex = parts.indexOf('cdr');

  if (cdrIndex === -1) return 0;
  if (!parts[cdrIndex + 1]) return 0;

  const cdr = parseInt(parts[cdrIndex + 1], 10);

  if (isNaN(cdr)) return 0;
  if (cdr < 0) return 0;

  return cdr;
}

function buildPayload(content) {
  const lines = content.split('\n');
  const payload = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line.startsWith('PTRE_ACTIVITY|') && !line.startsWith('PTRE_SCAN|')) {
      continue;
    }

    const parts = line.split('|');

    if (parts.length < 7) {
      console.log(`Linha PTRE inválida: ${line}`);
      continue;
    }

    const playerNameRaw = parts[1].trim();
    const playerName = cleanPlayerName(playerNameRaw);

    const coord = parts[2].trim();
    const type = parts[3].trim();

    const activity = activityValue(parts[4]);

    const planetID = parseInt(parts[5], 10);
    const moonID = parseInt(parts[6], 10);

    const cdrTotalSize = extractCdr(parts);

    const playerID = players[playerName.toLowerCase()];

    if (!playerID) {
      console.log(`Player não encontrado: ${playerName}`);
      continue;
    }

    const [galaxy, system, position] = coord.split(':').map(Number);

    if (!galaxy || !system || !position) {
      console.log(`Coord inválida: ${coord}`);
      continue;
    }

    if (!planetID || isNaN(planetID)) {
      console.log(`Planet ID inválido para ${playerName} em ${coord}`);
      continue;
    }

    if (!payload[coord]) {
      payload[coord] = {
        id: planetID,
        player_id: playerID,
        teamkey: PTRE_TEAM_KEY,
        mv: false,
        activity: 60,
        galaxy,
        system,
        position,
        main: false,
        cdr_total_size: cdrTotalSize
      };

      if (moonID > 0) {
        payload[coord].moon = {
          id: moonID,
          activity: 60
        };
      }
    }

    if (cdrTotalSize > payload[coord].cdr_total_size) {
      payload[coord].cdr_total_size = cdrTotalSize;
    }

    if (type === 'planet') {
      payload[coord].activity = activity;
    }

    if (type === 'moon') {
      if (moonID <= 0) {
        continue;
      }

      if (!payload[coord].moon) {
        payload[coord].moon = {
          id: moonID,
          activity: 60
        };
      }

      payload[coord].moon.activity = activity;
    }

    if (cdrTotalSize > 0) {
      console.log(`CDR detectado: ${coord} = ${cdrTotalSize}`);
    }
  }

  return payload;
}

async function sendToPtre(payload) {
  const url =
    `https://ptre.chez.gg/scripts/oglight_import_player_activity.php` +
    `?tool=oglight` +
    `&team_key=${encodeURIComponent(PTRE_TEAM_KEY)}` +
    `&country=${encodeURIComponent(COUNTRY)}` +
    `&univers=${encodeURIComponent(UNIVERSE)}` +
    `&version=${encodeURIComponent(VERSION)}`;

  const total = Object.keys(payload).length;
  const debrisCount = Object.values(payload).filter(
    p => p.cdr_total_size && p.cdr_total_size > 0
  ).length;

  console.log(`Enviando ${total} entradas para o PTRE`);
  console.log(`Entradas com CDR: ${debrisCount}`);
  console.log(`Team key usada: ${PTRE_TEAM_KEY}`);
  console.log(`Servidor PTRE usado: ${COUNTRY}-${UNIVERSE}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const txt = await res.text();

  console.log(`Resposta PTRE: ${txt}`);
}

client.on('messageCreate', async (message) => {
  try {
    if (!playersLoaded) {
      console.log('Players ainda não carregados. Mensagem ignorada.');
      return;
    }

    if (!message.content) return;
    if (!message.channel) return;
    if (message.channel.name !== CHANNEL_NAME) return;
    if (message.author && message.author.id === client.user.id) return;

    if (
      !message.content.includes('PTRE_ACTIVITY|') &&
      !message.content.includes('PTRE_SCAN|')
    ) {
      return;
    }

    const payload = buildPayload(message.content);
    const total = Object.keys(payload).length;

    console.log(`Relatório recebido: ${total}`);

    if (total <= 0) return;

    await sendToPtre(payload);
  } catch (e) {
    console.error('ERRO GERAL:', e);
  }
});

client.login(TOKEN);
