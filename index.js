import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_NAME = process.env.CHANNEL_NAME || 'scaner-ptre';
const PTRE_TEAM_KEY = process.env.PTRE_TEAM_KEY;
const COUNTRY = process.env.PTRE_COUNTRY || 'en';
const UNIVERSE = process.env.PTRE_UNIVERSE || '277';
const VERSION = process.env.PTRE_VERSION || '5.2.2';
const PLAYERS_XML = process.env.PLAYERS_XML || 'https://s277-en.ogame.gameforge.com/api/players.xml';
const PTRE_ENDPOINT = 'https://ptre.chez.gg/scripts/oglight_import_player_activity.php';

if (!TOKEN) throw new Error('Configure DISCORD_TOKEN no Railway.');
if (!PTRE_TEAM_KEY) throw new Error('Configure PTRE_TEAM_KEY no Railway.');

let players = new Map();
let playersLoaded = false;

function decodeXmlEntities(s) {
  return s.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[0-9a-f]+);/gi, entity => {
    const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    if (/^&#x/i.test(entity)) return String.fromCodePoint(parseInt(entity.slice(3, -1), 16));
    if (/^&#/.test(entity)) return String.fromCodePoint(parseInt(entity.slice(2, -1), 10));
    return entity;
  });
}

async function loadPlayers() {
  try {
    const response = await fetch(PLAYERS_XML, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await response.text();
    const next = new Map();
    for (const tag of xml.matchAll(/<player\b[^>]*\/?\s*>/g)) {
      const attrs = {};
      for (const m of tag[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)) {
        attrs[m[1]] = decodeXmlEntities(m[3]);
      }
      if (/^\d+$/.test(attrs.id || '') && attrs.name) {
        next.set(attrs.name.trim().toLowerCase(), Number(attrs.id));
      }
    }
    if (next.size === 0) throw new Error('Nenhum jogador encontrado no XML');
    players = next;
    playersLoaded = true;
    console.log(`Jogadores carregados: ${players.size} (${COUNTRY}-${UNIVERSE})`);
  } catch (error) {
    console.error('Falha ao atualizar players.xml:', error);
    // Mantém o último mapa válido, caso a API falhe temporariamente.
  }
}

function cleanPlayerName(raw) {
  return raw.replace(/\s*\(\d+\)\s*$/g, '').trim();
}

function activityValue(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return 60;
  if (n <= 15) return '*';
  return Math.min(n, 60);
}

function extractCdr(parts) {
  const index = parts.indexOf('cdr');
  if (index < 0) return 0;
  const value = Number.parseInt(parts[index + 1], 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function buildPayload(content) {
  const payload = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('PTRE_ACTIVITY|') && !line.startsWith('PTRE_SCAN|')) continue;
    const parts = line.split('|');
    if (parts.length < 7) {
      console.warn('Linha PTRE incompleta:', line);
      continue;
    }
    const name = cleanPlayerName(parts[1]);
    const playerID = players.get(name.toLowerCase());
    if (!playerID) {
      console.warn('Jogador não localizado na API:', name);
      continue;
    }
    const coord = parts[2].trim();
    const type = parts[3].trim().toLowerCase();
    const activity = activityValue(parts[4]);
    const planetID = Number.parseInt(parts[5], 10);
    const moonID = Number.parseInt(parts[6], 10) || 0;
    const cdr = extractCdr(parts);
    const coordinates = coord.match(/^(\d+):(\d+):(\d+)$/);
    if (!coordinates || !Number.isInteger(planetID) || planetID <= 0) {
      console.warn('Coordenada ou ID de planeta inválido:', coord, name);
      continue;
    }
    if (type !== 'planet' && type !== 'moon') continue;
    const [, g, s, p] = coordinates;
    if (!payload[coord]) {
      payload[coord] = {
        id: planetID, player_id: playerID, teamkey: PTRE_TEAM_KEY,
        mv: false, activity: 60, galaxy: Number(g), system: Number(s),
        position: Number(p), main: false, cdr_total_size: cdr
      };
      if (moonID > 0) payload[coord].moon = { id: moonID, activity: 60 };
    }
    const entry = payload[coord];
    entry.cdr_total_size = Math.max(entry.cdr_total_size, cdr);
    if (type === 'planet') entry.activity = activity;
    if (type === 'moon' && moonID > 0) {
      if (!entry.moon) entry.moon = { id: moonID, activity: 60 };
      entry.moon.activity = activity;
    }
  }
  return payload;
}

async function sendToPtre(payload) {
  const url = new URL(PTRE_ENDPOINT);
  url.searchParams.set('tool', 'oglight');
  url.searchParams.set('team_key', PTRE_TEAM_KEY);
  url.searchParams.set('country', COUNTRY);
  url.searchParams.set('univers', UNIVERSE);
  url.searchParams.set('version', VERSION);
  const total = Object.keys(payload).length;
  console.log(`Enviando ${total} entradas ao PTRE (${COUNTRY}-${UNIVERSE})`);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000)
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`PTRE HTTP ${response.status}: ${body.slice(0, 500)}`);
  console.log(`Resposta PTRE: ${body.slice(0, 500)}`);
}

client.once('ready', async () => {
  console.log(`Discord conectado: ${client.user.tag}`);
  console.log(`Canal: ${CHANNEL_NAME}; universo: ${COUNTRY}-${UNIVERSE}`);
  await loadPlayers();
  setInterval(loadPlayers, 6 * 60 * 60 * 1000).unref();
});

client.on('messageCreate', async message => {
  try {
    if (!playersLoaded || !message.content || !message.channel) return;
    if (message.author?.bot && message.author.id === client.user?.id) return;
    if (message.channel.name !== CHANNEL_NAME) return;
    if (!message.content.includes('PTRE_ACTIVITY|') && !message.content.includes('PTRE_SCAN|')) return;
    const payload = buildPayload(message.content);
    if (Object.keys(payload).length === 0) return;
    await sendToPtre(payload);
  } catch (error) {
    console.error('Erro ao processar mensagem:', error);
  }
});

await client.login(TOKEN);
