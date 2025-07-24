require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config/botConfig');
const logger = require('./utils/logger');
const MentionHandler = require('./handlers/MentionHandler');

class DiscordBot {
  constructor() {
    // Initialize Discord client with configured intents
    this.client = new Client({
      intents: config.discord.intents.map(intent => GatewayIntentBits[intent])
    });

    // Initialize handlers
    this.handlers = [
      new MentionHandler(this.client)
    ];

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Bot ready event
    this.client.once('ready', () => {
      logger.info(`Bot logged in as ${this.client.user.tag}!`, {
        botId: this.client.user.id,
        botUsername: this.client.user.username,
        botDiscriminator: this.client.user.discriminator
      });
    });

    // Message handling
    this.client.on('messageCreate', async (message) => {
      await this.handleMessage(message);
    });

    // Error handling
    this.client.on('error', (error) => {
      logger.error('Discord client error:', { error: error.message });
    });

    // Process error handling
    process.on('unhandledRejection', (error) => {
      logger.error('Unhandled promise rejection:', { error: error.message });
    });

    process.on('uncaughtException', (error) => {
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

// Export bot instance and start it
const bot = new DiscordBot();
bot.start();

module.exports = bot;