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

    console.log('==============================');
    console.log('RELATORIO RECEBIDO');
    console.log(message.content);
    console.log('==============================');

    // FUTURO ENVIO PTRE
    // API KEY JA CONFIGURADA
    console.log(`PTRE KEY: ${PTRE_API_KEY}`);

  } catch (err) {
    console.error(err);
  }
});

client.login(process.env.DISCORD_TOKEN);
