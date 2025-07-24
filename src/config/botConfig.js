const constants = require('../utils/constants');
const logger = require('../utils/logger');

class BotConfig {
  constructor() {
    this.validateEnvironment();
    this.initializeConfig();
  }

  validateEnvironment() {
    const required = ['DISCORD_TOKEN'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Warn about optional variables
    if (!process.env.OPENAI_API_KEY) {
      logger.warn('OPENAI_API_KEY not found. AI features will not work.');
    }
  }

  initializeConfig() {
    this.discord = {
      token: process.env.DISCORD_TOKEN,
      intents: constants.REQUIRED_INTENTS
    };

    this.ai = {
      provider: process.env.AI_PROVIDER || constants.DEFAULT_AI_PROVIDER,
      apiKey: process.env.OPENAI_API_KEY,
      defaultPrompt: constants.DEFAULT_USER_PROMPT
    };

    this.channels = {
      ai: process.env.AI_CHANNEL || constants.DEFAULT_AI_CHANNEL,
      general: process.env.GENERAL_CHANNEL || constants.DEFAULT_GENERAL_CHANNEL
    };

    this.limits = {
      maxMessagesFetch: parseInt(process.env.MAX_MESSAGES_FETCH) || constants.MAX_MESSAGES_FETCH,
      batchSize: constants.BATCH_SIZE,
      discordMessageLimit: constants.DISCORD_MESSAGE_LIMIT,
      defaultContextMessages: constants.DEFAULT_CONTEXT_MESSAGES,
      previewLength: constants.PREVIEW_LENGTH
    };

    this.debug = {
      enabled: process.env.DEBUG,
      fetchedFile: constants.DEBUG_FETCHED_FILE,
      inputFile: constants.DEBUG_INPUT_FILE
    };
  }

  get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this);
  }
}

module.exports = new BotConfig();
