require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes
} = require('discord.js');
const config = require('./config/botConfig');
const logger = require('./utils/logger');
const MentionHandler = require('./handlers/MentionHandler');
const IndexService = require('./services/IndexService');
const { parseDateRange, DISCORD_EPOCH } = require('./utils/messageUtils');

class DiscordBot {
  constructor() {
    this.client = new Client({
      intents: config.discord.intents.map(i => GatewayIntentBits[i])
    });

    this.handlers = [new MentionHandler(this.client)];
    this.indexService = new IndexService();

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.client.once('ready', async () => {
      logger.info(`Bot logged in as ${this.client.user.tag}!`);

      // Register slash command /index
      const commands = [
        {
          name: 'index',
          description: 'Index chat messages for a date or date range',
          options: [
            {
              name: 'daterange',
              type: 3, // STRING
              description: 'Date or range: {MM/DD/YYYY} or {MM/DD/YYYY - MM/DD/YYYY}',
              required: false
            }
          ]
        }
      ];
      const rest = new REST({ version: '10' }).setToken(config.discord.token);
      try {
        await rest.put(
          Routes.applicationCommands(this.client.application.id),
          { body: commands }
        );
        logger.info('Slash command /index registered');
      } catch (err) {
        logger.error('Failed to register slash command', { error: err.message });
      }
    });

    // Slash command handler
    this.client.on('interactionCreate', async interaction => {
      if (!interaction.isCommand() || interaction.commandName !== 'index') return;
      await interaction.deferReply();
      const raw = interaction.options.getString('daterange');
      const range = parseDateRange(raw || '') || {
        startUTC: DISCORD_EPOCH,
        endUTC: Date.now()
      };
      const summary = await this.indexService.indexHistoricMessages(
        interaction.channel,
        range
      );
      const logPath = `${this.indexService.logsPath}/${interaction.channel.id}/` +
        `${new Date(summary.from).getFullYear()}/` +
        `${String(new Date(summary.from).getMonth() + 1).padStart(2, '0')}.jsonl`;
      await interaction.editReply(
        `Indexed ${summary.count} messages from ${summary.from} to ${summary.to} in ${summary.timeMs}ms.\n` +
        `Logs: ${logPath}`
      );
    });

    // Message handler (persist & fallback indexing)
    this.client.on('messageCreate', async message => {
      // Skip bot messages
      if (message.author.bot) return;

      // Fallback text command '/index'
      if (message.content.startsWith('/index')) {
        const raw = message.content.slice(6).trim();
        const range = parseDateRange(raw) || {
          startUTC: DISCORD_EPOCH,
          endUTC: Date.now()
        };
        const summary = await this.indexService.indexHistoricMessages(
          message.channel,
          range
        );
        const logPath = `${this.indexService.logsPath}/${message.channel.id}/` +
          `${new Date(summary.from).getFullYear()}/` +
          `${String(new Date(summary.from).getMonth() + 1).padStart(2, '0')}.jsonl`;
        await message.reply(
          `Indexed ${summary.count} messages from ${summary.from} to ${summary.to} in ${summary.timeMs}ms.\n` +
          `Logs: ${logPath}`
        );
        return;
      }

      // Always persist incoming message for archive
      this.indexService.appendMessage(message);

      // Continue original mention-based logic
      await this.handleMessage(message);
    });

    // Error and process handlers
    this.client.on('error', error => {
      logger.error('Discord client error:', { error: error.message });
    });
    process.on('unhandledRejection', error => {
      logger.error('Unhandled rejection:', { error: error.message });
    });
    process.on('uncaughtException', error => {
      logger.error('Uncaught exception:', { error: error.message });
      process.exit(1);
    });
  }

  async handleMessage(message) {
    try {
      logger.info('🔔 MESSAGE RECEIVED:', {
        messageId: message.id,
        authorId: message.author.id,
        channelId: message.channel.id,
        content: message.content
      });

      // Detect date patterns but let handlers decide
      const hasDatePattern = /\{\s*([0-9/]+|Today)(?:\s*-\s*([0-9/]+|Today))?\s*\}/i.test(
        message.content
      );
      if (hasDatePattern) {
        logger.info('📅 DATE PATTERN DETECTED', { content: message.content });
      }

      for (const handler of this.handlers) {
        if (handler.shouldHandle(message)) {
          await handler.handle(message);
          return;
        }
      }
      logger.debug('No handler matched message');
    } catch (error) {
      logger.error('Error in handleMessage:', { error: error.message });
      try {
        await message.reply('Error processing your message.');
      } catch {}
    }
  }

  async start() {
    try {
      await this.client.login(config.discord.token);
    } catch (error) {
      logger.error('Failed to start bot:', { error: error.message });
      process.exit(1);
    }
  }

  async stop() {
    try {
      await this.client.destroy();
    } catch (error) {
      logger.error('Error stopping bot:', { error: error.message });
    }
  }
}

const bot = new DiscordBot();
bot.start();

module.exports = bot;
