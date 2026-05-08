import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TOKEN = process.env.DISCORD_TOKEN;

const CHANNEL_NAME = 'monitorar-alvos';

client.once('ready', () => {
  console.log(`Bot online: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  try {
    if (!message.content) return;
    if (!message.channel || message.channel.name !== CHANNEL_NAME) return;

    // Não ignorar webhooks/bots do NinjaBot.
    // Ignora apenas mensagens do próprio bot Railway.
    if (message.author.id === client.user.id) return;

    const content = message.content.trim();

    console.log('========================');
    console.log('RELATORIO RECEBIDO');
    console.log(content);
    console.log('========================');

    const lines = content.split('\n');
    const activities = [];

    for (const line of lines) {
      if (!line.startsWith('PTRE_ACTIVITY|')) continue;

      const parts = line.split('|');

      if (parts.length < 7) continue;

      const player = parts[1];
      const coord = parts[2];
      const type = parts[3];
      const activity = parseInt(parts[4], 10);
      const planetID = parseInt(parts[5], 10);
      const moonID = parseInt(parts[6], 10);

      const coordParts = coord.split(':');

      activities.push({
        galaxy: parseInt(coordParts[0], 10),
        system: parseInt(coordParts[1], 10),
        position: parseInt(coordParts[2], 10),
        player: player,
        type: type,
        activity: activity,
        id_planet: planetID,
        id_moon: moonID,
        coord: coord
      });
    }

    console.log('ATIVIDADES PROCESSADAS:');
    console.log(JSON.stringify(activities, null, 2));
    console.log('TOTAL:', activities.length);
    console.log('========================');

  } catch (err) {
    console.error('ERRO:', err);
  }
});

client.login(TOKEN);
