import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const CHANNEL_NAME = 'monitorar-alvos';

const PTRE_API_KEY = 'TM-GDID-6GU7-ZXAW-OGEN';
const PTRE_TEAM_KEY = 'wo-dmah-slfa-9kmn-8u63';

const PTRE_COUNTRY = 'br';
const PTRE_UNIVERSE = '178';
const PTRE_VERSION = '0.15.1';

client.once('ready', () => {
  console.log(`Bot online: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot === false) return;
    if (!message.content) return;
    if (!message.channel || message.channel.name !== CHANNEL_NAME) return;

    const report = message.content.trim();

    console.log('========================');
    console.log('RELATORIO RECEBIDO');
    console.log(report);

    const params = new URLSearchParams({
      tool: 'oglight',
      team_key: PTRE_TEAM_KEY,
      country: PTRE_COUNTRY,
      univers: PTRE_UNIVERSE,
      version: PTRE_VERSION
    });

    const url = `https://ptre.chez.gg/scripts/oglight_import_player_activity.php?${params.toString()}`;

    const payload = {
      discord_message_id: message.id,
      channel: message.channel.name,
      content: report
    };

    console.log('URL PTRE:');
    console.log(url);

    console.log('PAYLOAD PTRE:');
    console.log(payload);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();

    console.log('========================');
    console.log('RESPOSTA PTRE:');
    console.log(text);
    console.log('========================');

  } catch (err) {
    console.error('ERRO:', err);
  }
});

client.login(process.env.DISCORD_TOKEN);
