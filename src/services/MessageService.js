const { parseDateRange, fetchMessagesOptimized } = require('../utils/messageUtils');
const config = require('../config/botConfig');
const logger = require('../utils/logger');
const IndexService = require('./IndexService');

class MessageService {
  constructor(channel) {
    this.channel = channel;
    this.indexService = new IndexService();
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
        logger.debug('Fetching messages for date range', { dateRange });

        // Attempt to retrieve from local index if persistence enabled
        if (this.indexService.enabled) {
          const indexed = await this.indexService.getMessagesByDateRange(
            this.channel.id, dateRange
          );
          if (indexed.sorted && indexed.sorted.length > 0) {
            logger.info(`Retrieved ${indexed.sorted.length} messages from local index`);
            return {
              sorted: indexed.sorted,
              rawLog: indexed.sorted,
              hitLimit: false,
              stopTime: null
            };
          }
          logger.info('Local index empty for requested date range, falling back to API fetch');
        }

        // Use optimized fetch for date range queries
        const result = await fetchMessagesOptimized(this.channel, {
          ...dateRange,
          max: config.limits.maxMessagesFetch
        });

        // Enhanced logging with performance metrics
        const logData = {
          messagesFound: result.sorted.length,
          fetchTime: result.fetchTime || 'unknown',
          apiCalls: result.apiCalls || 'unknown',
          usedFallback: result.usedFallback || false,
          hadError: result.hadError || false,
          dateRange: {
            start: new Date(dateRange.startUTC).toISOString(),
            end: new Date(dateRange.endUTC).toISOString()
          }
        };

        if (result.usedFallback) {
          logger.warn('Optimized fetch used fallback to linear search', logData);
        } else {
          logger.info(`✨ Optimized fetch successful: ${result.sorted.length} messages in ${result.fetchTime}ms with ${result.apiCalls} API calls`, logData);
        }

        // Return API-fetched result
        return result;
      } else {
        // Default context fetch
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
