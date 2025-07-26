require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes
} = require('discord.js');
const config = require('./config/botConfig');
const logger = require('./utils/logger');
const ContextHandler = require('./handlers/ContextHandler');
const MentionHandler = require('./handlers/MentionHandler');
const IndexService = require('./services/IndexService');
const { parseDateRange, DISCORD_EPOCH } = require('./utils/messageUtils');

class DiscordBot {
  constructor() {
    this.client = new Client({
      intents: config.discord.intents.map(i => GatewayIntentBits[i])
    });

    this.handlers = [new ContextHandler(this.client), new MentionHandler(this.client)];
    this.indexService = new IndexService();

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Bot ready event
    this.client.once('ready', async () => {
      logger.info(`Bot logged in as ${this.client.user.tag}!`, {
        botId: this.client.user.id,
        botUsername: this.client.user.username,
        botDiscriminator: this.client.user.discriminator
      });

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
        `Logs saved for date range: ${summary.from} to ${summary.to}`
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
          `Logs saved for date range: ${summary.from} to ${summary.to}`
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
      logger.error('Unhandled promise rejection:', { error: error.message });
    });
    process.on('uncaughtException', error => {
      logger.error('Uncaught exception:', { error: error.message });
      process.exit(1);
    });
  }

  async handleMessage(message) {
    try {
      // Enhanced logging to catch ALL messages
      logger.info('🔔 MESSAGE RECEIVED:', {
        messageId: message.id,
        authorId: message.author.id,
        authorTag: message.author.tag,
        channelId: message.channel.id,
        content: message.content,
        contentLength: message.content.length,
        mentions: message.mentions.users.map(user => ({ id: user.id, tag: user.tag })),
        mentionsBot: message.mentions.has(this.client.user),
        isBot: message.author.bot,
        timestamp: new Date().toISOString(),
        createdAt: message.createdAt.toISOString()
      });

      // Specifically check for date patterns
      const hasDatePattern = /\{\s*([0-9/]+|Today)(?:\s*-\s*([0-9/]+|Today))?\s*\}/i.test(message.content);
      if (hasDatePattern) {
        logger.info('📅 DATE PATTERN DETECTED:', {
          messageId: message.id,
          content: message.content,
          authorTag: message.author.tag,
          mentionsBot: message.mentions.has(this.client.user)
        });
      }

      // Find a handler that can process this message
      let handlerFound = false;
      for (const handler of this.handlers) {
        const shouldHandle = handler.shouldHandle(message);
        logger.debug('🔍 Checking handler:', {
          handlerName: handler.constructor.name,
          shouldHandle,
          messageId: message.id,
          mentionsBot: message.mentions.has(this.client.user),
          isBot: message.author.bot
        });

        if (shouldHandle) {
          logger.info('✅ Handler processing message:', {
            handlerName: handler.constructor.name,
            messageId: message.id,
            content: message.content.substring(0, 100)
          });

          try {
            await handler.handle(message);
            logger.info('✅ Handler completed successfully:', {
              handlerName: handler.constructor.name,
              messageId: message.id
            });
          } catch (handlerError) {
            logger.error('❌ Handler execution failed:', {
              handlerName: handler.constructor.name,
              messageId: message.id,
              error: handlerError.message,
              stack: handlerError.stack
            });
            throw handlerError; // Re-throw to be caught by outer try-catch
          }

          handlerFound = true;
          break; // Only process with first matching handler
        }
      }

      if (!handlerFound) {
        logger.warn('⚠️ No handler found for message:', {
          messageId: message.id,
          content: message.content.substring(0, 100),
          mentionsBot: message.mentions.has(this.client.user),
          isBot: message.author.bot,
          authorTag: message.author.tag
        });
      }
    } catch (error) {
      logger.error('💥 CRITICAL MESSAGE HANDLING ERROR:', {
        messageId: message?.id,
        authorId: message?.author?.id,
        authorTag: message?.author?.tag,
        channelId: message?.channel?.id,
        content: message?.content?.substring(0, 200),
        error: error.message,
        stack: error.stack
      });

      // Try to reply with error if possible
      try {
        if (message && message.reply) {
          await message.reply("I encountered an error processing your message. Please try again.");
        }
      } catch (replyError) {
        logger.error('Failed to send error reply:', { error: replyError.message });
      }
    }
  }

  async start() {
    try {
      logger.info('Starting Discord bot...');
      await this.client.login(config.discord.token);
    } catch (error) {
      logger.error('Failed to start bot:', { error: error.message });
      process.exit(1);
    }
  }

  async stop() {
    try {
      logger.info('Stopping Discord bot...');
      await this.client.destroy();
    } catch (error) {
      logger.error('Error stopping bot:', { error: error.message });
    }
  }
}

const bot = new DiscordBot();
bot.start();

module.exports = bot;
