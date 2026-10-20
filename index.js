/**
 * PTRE Discord Relay - Veritate EN 277 + Dione BR 182
 * Arquivo para o GitHub: index.js (Node.js 18+ / discord.js v14)
 *
 * O Kepler envia linhas PTRE_SCAN|... ou PTRE_ACTIVITY|... ao Discord.
 * Este bot identifica o universo PELO CANAL, resolve o ID do jogador
 * no players.xml daquele universo e encaminha as atividades ao PTRE.
 *
 * Não coloque o token Discord ou a chave PTRE neste arquivo.
 * Configure-os nas variáveis privadas do Railway.
 */

import { Client, GatewayIntentBits, Events } from 'discord.js';

const TOKEN = process.env.DISCORD_TOKEN;
const TEAM_KEY = process.env.PTRE_TEAM_KEY;
const PTRE_ENDPOINT = 'https://ptre.chez.gg/scripts/oglight_import_player_activity.php';
const REFRESH_MS = 6 * 60 * 60 * 1000;

if (!TOKEN) throw new Error('Configure DISCORD_TOKEN no Railway.');
if (!TEAM_KEY) throw new Error('Configure PTRE_TEAM_KEY no Railway.');

// MANTER as variáveis atuais do Veritate: elas já estão no Railway.
// Dione usa um segundo canal Discord e sua própria API de jogadores.
const servers = [
  {
    label: 'Veritate EN',
    country: process.env.PTRE_COUNTRY || 'en',
    universe: String(process.env.PTRE_UNIVERSE || '277'),
    channelName: process.env.CHANNEL_NAME || 'scaner-ptre',
    channelId: process.env.VERITATE_CHANNEL_ID || '', // Opcional (mais seguro)
    playersXml: process.env.PLAYERS_XML || 'https://s277-en.ogame.gameforge.com/api/players.xml',
    teamKey: TEAM_KEY,
    version: process.env.PTRE_VERSION || '5.2.2',
    players: new Map(),
    loaded: false
  },
  {
    label: 'Dione BR',
    country: 'br',
    universe: '182',
    channelName: process.env.DIONE_CHANNEL_NAME || 'scaner-ptre-dione',
    channelId: process.env.DIONE_CHANNEL_ID || '', // Opcional (mais seguro)
    playersXml: process.env.DIONE_PLAYERS_XML || 'https://s182-br.ogame.gameforge.com/api/players.xml',
    // Permite chave específica no Dione; se não houver, usa a atual.
    teamKey: process.env.PTRE_TEAM_KEY_DIONE || TEAM_KEY,
    version: process.env.PTRE_VERSION || '5.2.2',
    players: new Map(),
    loaded: false
  }
];

// Impede, por engano, o envio dos dois universos para o mesmo canal.
const seenChannels = new Set();
for (const server of servers) {
  const channelKey = server.channelId
    ? `id:${server.channelId}`
    : `name:${server.channelName.trim().toLowerCase()}`;
  if (seenChannels.has(channelKey)) {
    throw new Error('Os dois universos não podem usar o mesmo canal Discord.');
  }
  seenChannels.add(channelKey);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

function decodeXmlEntities(value) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[0-9a-f]+);/gi, entity => {
    const named = {
      '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>'
    };
    const lower = entity.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(named, lower)) return named[lower];
    const hex = /^&#x([0-9a-f]+);$/i.exec(entity);
    const dec = /^&#(\d+);$/i.exec(entity);
    const code = hex ? Number.parseInt(hex[1], 16) : dec ? Number.parseInt(dec[1], 10) : -1;
    return code >= 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code)
      : entity;
  });
}

function normalizeName(name) {
  return String(name).trim().toLowerCase();
}

function cleanPlayerName(name) {
  // Mantém o comportamento do index.js antigo para apelidos como Nome (123).
  return String(name).replace(/\s*\(\d+\)\s*$/g, '').trim();
}

async function loadPlayers(server) {
  try {
    const response = await fetch(server.playersXml, {
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await response.text();
    const next = new Map();

    for (const tag of xml.matchAll(/<player\b[^>]*\/?\s*>/g)) {
      const attrs = {};
      for (const match of tag[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)) {
        attrs[match[1]] = decodeXmlEntities(match[3]);
      }
      if (/^\d+$/.test(attrs.id || '') && attrs.name) {
        next.set(normalizeName(attrs.name), Number(attrs.id));
      }
    }
    if (next.size === 0) throw new Error('API retornou zero jogadores');

    server.players = next;
    server.loaded = true;
    console.log(`[${server.country}-${server.universe}] ${next.size} jogadores carregados`);
  } catch (error) {
    // Em caso de falha temporária, o último mapa válido é preservado.
    console.error(`[${server.country}-${server.universe}] Erro ao ler players.xml: ${error.message}`);
  }
}

function findServerByChannel(channel) {
  if (!channel) return null;
  for (const server of servers) {
    if (server.channelId && channel.id === server.channelId) return server;
  }
  for (const server of servers) {
    if (!server.channelId && normalizeName(channel.name || '') === normalizeName(server.channelName)) {
      return server;
    }
  }
  return null;
}

function parseActivity(value) {
  const text = String(value).trim();
  if (text === '*') return '*';
  const n = Number.parseInt(text, 10);
  if (!Number.isFinite(n) || n <= 0) return 60;
  if (n <= 15) return '*';
  return Math.min(n, 60);
}

function parseDebris(parts) {
  const index = parts.findIndex(part => part.trim().toLowerCase() === 'cdr');
  if (index < 0) return 0;
  const n = Number.parseInt(parts[index + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function buildPayload(content, server) {
  const payload = Object.create(null);
  let ignored = 0;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('PTRE_SCAN|') && !line.startsWith('PTRE_ACTIVITY|')) continue;

    const parts = line.split('|');
    if (parts.length < 7) { ignored++; continue; }

    const name = cleanPlayerName(parts[1]);
    const playerID = server.players.get(normalizeName(name));
    if (!playerID) {
      console.warn(`[${server.country}-${server.universe}] Jogador ausente na API: ${name}`);
      ignored++;
      continue;
    }

    const coord = parts[2].trim();
    const type = parts[3].trim().toLowerCase();
    const coordinates = /^(\d+):(\d+):(\d+)$/.exec(coord);
    const planetID = Number.parseInt(parts[5], 10);
    const moonID = Number.parseInt(parts[6], 10) || 0;
    if (!coordinates || !Number.isSafeInteger(planetID) || planetID <= 0 ||
        (type !== 'planet' && type !== 'moon')) {
      console.warn(`[${server.country}-${server.universe}] Linha PTRE inválida: ${coord} (${name})`);
      ignored++;
      continue;
    }

    const [, gal, sys, pos] = coordinates;
    const cdr = parseDebris(parts);
    if (!payload[coord]) {
      payload[coord] = {
        id: planetID,
        player_id: playerID,
        teamkey: server.teamKey,
        mv: false,
        activity: 60,
        galaxy: Number(gal),
        system: Number(sys),
        position: Number(pos),
        main: false,
        cdr_total_size: cdr
      };
      if (moonID > 0) payload[coord].moon = { id: moonID, activity: 60 };
    }

    const entry = payload[coord];
    entry.cdr_total_size = Math.max(entry.cdr_total_size, cdr);
    if (type === 'planet') entry.activity = parseActivity(parts[4]);
    if (type === 'moon' && moonID > 0) {
      if (!entry.moon) entry.moon = { id: moonID, activity: 60 };
      entry.moon.activity = parseActivity(parts[4]);
    }
  }

  return { payload, ignored };
}

async function sendToPtre(payload, server) {
  const url = new URL(PTRE_ENDPOINT);
  url.searchParams.set('tool', 'oglight');
  url.searchParams.set('team_key', server.teamKey);
  url.searchParams.set('country', server.country);
  url.searchParams.set('univers', server.universe);
  url.searchParams.set('version', server.version);

  const total = Object.keys(payload).length;
  console.log(`[${server.country}-${server.universe}] Enviando ${total} posições ao PTRE`);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000)
  });
  const result = await response.text();
  if (!response.ok) {
    throw new Error(`PTRE HTTP ${response.status}: ${result.slice(0, 300)}`);
  }
  console.log(`[${server.country}-${server.universe}] Resposta PTRE: ${result.slice(0, 500)}`);
}

client.once(Events.ClientReady, async () => {
  console.log(`Discord conectado: ${client.user.tag}`);
  for (const server of servers) {
    console.log(`[${server.country}-${server.universe}] Canal: #${server.channelName}`);
  }
  await Promise.all(servers.map(loadPlayers));
  setInterval(() => {
    Promise.all(servers.map(loadPlayers)).catch(error => console.error('Erro na atualização:', error));
  }, REFRESH_MS).unref();
});

client.on(Events.MessageCreate, async message => {
  try {
    if (!message.content || !message.channel) return;
    if (message.author?.id === client.user?.id) return;

    const server = findServerByChannel(message.channel);
    if (!server) return;
    if (!message.content.includes('PTRE_SCAN|') && !message.content.includes('PTRE_ACTIVITY|')) return;

    if (!server.loaded) {
      console.warn(`[${server.country}-${server.universe}] API de jogadores ainda indisponível`);
      return;
    }

    const { payload, ignored } = buildPayload(message.content, server);
    const total = Object.keys(payload).length;
    if (ignored) console.warn(`[${server.country}-${server.universe}] ${ignored} linhas ignoradas`);
    if (total === 0) return;

    await sendToPtre(payload, server);
  } catch (error) {
    console.error(`Erro ao processar mensagem Discord: ${error.message}`);
  }
});

client.login(TOKEN).catch(error => {
  console.error(`Falha ao conectar ao Discord: ${error.message}`);
  process.exitCode = 1;
});
