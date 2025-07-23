const { parseDateRange, fetchMessages } = require('../utils/messageUtils');
const config = require('../config/botConfig');
const logger = require('../utils/logger');

class MessageService {
  constructor(channel) {
    this.channel = channel;
  }

  /**
   * Parse date range from message content
   */
  parseDateRange(content) {
    return parseDateRange(content);
  }

  /**
   * Fetch messages based on date range or default context
   */
  async fetchMessagesForContext(dateRange = null) {
    try {
      if (dateRange) {
        logger.debug('Fetching messages with date range', { dateRange });
        const result = await fetchMessages(this.channel, {
          ...dateRange,
          max: config.limits.maxMessagesFetch
        });
        
        logger.info(`Fetched ${result.sorted.length} messages in date range`);
        return result;
      } else {
        logger.debug('Fetching default context messages');
        const fetched = await this.channel.messages.fetch({ 
          limit: config.limits.defaultContextMessages 
        });
        const sorted = Array.from(fetched.values())
          .sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        
        logger.info(`Fetched ${sorted.length} context messages`);
        return {
          sorted,
          rawLog: sorted,
          hitLimit: false,
          stopTime: null
        };
      }
    } catch (error) {
      logger.error('Failed to fetch messages:', { error: error.message });
      throw new Error('Failed to fetch conversation messages');
    }
  }

  /**
   * Extract user prompt from mention message
   */
  extractUserPrompt(content, botId) {
    try {
      // Remove date range braces and bot mention
      let userPrompt = content
        .replace(/\{[^}]*\}/, '')
        .replace(`<@${botId}>`, '')
        .trim();
      
      if (!userPrompt) {
        userPrompt = config.ai.defaultPrompt;
        logger.debug('Using default prompt');
      } else {
        logger.debug('Extracted user prompt', { prompt: userPrompt });
      }
      
      return userPrompt;
    } catch (error) {
      logger.error('Failed to extract user prompt:', { error: error.message });
      return config.ai.defaultPrompt;
    }
  }

  /**
   * Write debug files if debugging is enabled
   */
  writeDebugFiles(rawMessages, aiInput) {
    if (!config.debug.enabled) return;

    try {
      // Write fetched messages debug file
      const fetchedLog = rawMessages.map(m => ({
        id: m.id,
        authorId: m.author.id,
        content: m.content,
        createdAt: new Date(m.createdTimestamp).toISOString()
      }));
      
      logger.writeDebugFile(
        config.debug.fetchedFile, 
        fetchedLog, 
        'Fetched messages log'
      );

      // Write AI input debug file
      logger.writeDebugFile(
        config.debug.inputFile, 
        aiInput, 
        'AI input array'
      );
    } catch (error) {
      logger.error('Failed to write debug files:', { error: error.message });
    }
  }
}

module.exports = MessageService;
