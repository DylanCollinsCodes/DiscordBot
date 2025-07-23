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

    // Initialize the specific handler to use
    this.currentHandler = new MentionHandler(this.client);

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Bot ready event
    this.client.once('ready', () => {
      logger.info(`Bot logged in as ${this.client.user.tag}!`);
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
      // Use the specific current handler
      if (this.currentHandler.shouldHandle(message)) {
        await this.currentHandler.handle(message);
      }
    } catch (error) {
      logger.error('Message handling error:', {
        messageId: message.id,
        error: error.message
      });
    }
  }

  /**
   * Switch to a different handler
   * @param {BaseHandler} newHandler - The new handler to use
   */
  setHandler(newHandler) {
    logger.info('Switching message handler', { 
      from: this.currentHandler.constructor.name,
      to: newHandler.constructor.name 
    });
    this.currentHandler = newHandler;
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
