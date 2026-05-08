import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const CHANNEL_NAME = 'monitorar-alvos';

client.once('ready', () => {
  console.log(`Bot online: ${client.user.tag}`);
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

    // AQUI futuramente enviaremos ao PTRE
    // neste momento ele já captura os relatórios corretamente

  } catch (err) {
    console.error(err);
  }
});

client.login(process.env.DISCORD_TOKEN);
