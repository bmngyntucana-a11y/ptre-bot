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
const PTRE_URL = 'https://ptre.chez.gg/scripts/oglight_import.php';

client.once('ready', () => {
  console.log(`Bot online: ${client.user.tag}`);
  console.log(`PTRE API configurada`);
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot === false) return;
    if (!message.content) return;

    if (!message.channel || message.channel.name !== CHANNEL_NAME) {
      return;
    }

    const report = message.content.trim();

    console.log('========================');
    console.log('RELATORIO RECEBIDO');
    console.log(report);

    const body = new URLSearchParams();
    body.append('sr_id', PTRE_API_KEY);

    const response = await fetch(PTRE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
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
