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

client.once('ready', () => {
  console.log(`Bot online: ${client.user.tag}`);
  console.log(`PTRE API: ${PTRE_API_KEY}`);
});

client.on('messageCreate', async (message) => {
  try {

    if (message.author.bot === false) return;

    if (!message.content) return;

    if (
      !message.channel ||
      message.channel.name !== CHANNEL_NAME
    ) {
      return;
    }

    console.log('========================');
    console.log('RELATORIO RECEBIDO');
    console.log(message.content);
    console.log('========================');

    const payload = {
      team_key: PTRE_TEAM_KEY,
      api_key: PTRE_API_KEY,
      report: message.content
    };

    console.log('PAYLOAD PTRE:');
    console.log(payload);

    const response = await fetch('https://ptre.chez.gg/scripts/oglight_import.php', {
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
