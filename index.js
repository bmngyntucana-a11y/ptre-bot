import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const CHANNEL_NAME = 'monitorar-alvos';

const PTRE_TEAM_KEY = 'wo-dmah-slfa-9kmn-8u63';
const PTRE_COUNTRY = 'br';
const PTRE_UNIVERSE = '178';
const PTRE_VERSION = '0.15.1';

client.once('ready', () => {
  console.log(`Bot online: ${client.user.tag}`);
});

function parseActivities(text) {

  const lines = text.split('\n');
  const activities = [];

  for (const line of lines) {

    if (!line.startsWith('PTRE_ACTIVITY|')) continue;

    const parts = line.trim().split('|');

    if (parts.length < 5) continue;

    const player = parts[1];
    const coord = parts[2];
    const typeRaw = parts[3];
    const activity = parseInt(parts[4], 10);

    const coordParts = coord.split(':');

    if (coordParts.length !== 3) continue;

    let type = 'planet';

    if (typeRaw === 'lua') {
      type = 'moon';
    }

    activities.push({
      galaxy: parseInt(coordParts[0], 10),
      system: parseInt(coordParts[1], 10),
      position: parseInt(coordParts[2], 10),

      player: player,

      type: type,

      activity: activity
    });
  }

  return activities;
}

client.on('messageCreate', async (message) => {

  try {

    if (!message.author.bot) return;
    if (!message.content) return;
    if (!message.channel) return;
    if (message.channel.name !== CHANNEL_NAME) return;

    const report = message.content.trim();

    const activities = parseActivities(report);

    if (activities.length === 0) {

      console.log('========================');
      console.log('Mensagem ignorada: sem PTRE_ACTIVITY');
      console.log('========================');

      return;
    }

    console.log('========================');
    console.log('RELATORIO RECEBIDO');
    console.log(report);

    const url =
      `https://ptre.chez.gg/scripts/oglight_import_player_activity.php` +
      `?tool=oglight` +
      `&team_key=${PTRE_TEAM_KEY}` +
      `&country=${PTRE_COUNTRY}` +
      `&univers=${PTRE_UNIVERSE}` +
      `&version=${PTRE_VERSION}`;

    const payload = {
      team_key: PTRE_TEAM_KEY,

      activities: activities
    };

    console.log('========================');
    console.log('URL PTRE:');
    console.log(url);

    console.log('========================');
    console.log('PAYLOAD PTRE:');
    console.log(JSON.stringify(payload, null, 2));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();

    console.log('========================');
    console.log('RESPOSTA PTRE:');
    console.log(responseText);
    console.log('========================');

  } catch (err) {

    console.log('========================');
    console.log('ERRO:');
    console.log(err);
    console.log('========================');
  }
});

client.login(process.env.DISCORD_TOKEN);
