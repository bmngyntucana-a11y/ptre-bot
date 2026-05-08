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
const PTRE_WO = 'w0-dmah-slfa-9kmn-8u63';

client.once('ready', () => {
  console.log(`Bot online: ${client.user.tag}`);
  console.log(`PTRE API: ${PTRE_API_KEY}`);
});

client.on('messageCreate', async (message) => {
  try {

    if (message.author.bot === false) return;

    if (!message.content) return;

    if (
      message.channel &&
      message.channel.name !== CHANNEL_NAME
    ) {
      return;
    }

    if (
      !message.content.includes('Relatório') &&
      !message.content.includes('ONLINE provável') &&
      !message.content.includes('OFFLINE provável')
    ) {
      return;
    }

    console.log('RELATORIO RECEBIDO');
    console.log(message.content);

    const payload = {
      w0: PTRE_WO,
      api_key: PTRE_API_KEY,
      report: message.content
    };

    console.log('==========================');
    console.log('PAYLOAD PTRE:');
    console.log(payload);
    console.log('==========================');

    const response = await fetch('https://ptre.chez.gg/scripts/api/discord', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();

    console.log('==========================');
    console.log('RESPOSTA PTRE:');
    console.log(text);
    console.log('==========================');

  } catch (err) {
    console.error(err);
  }
});

client.login(process.env.DISCORD_TOKEN);
