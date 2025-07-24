const { parseDateRange, fetchMessagesOptimized } = require('../utils/messageUtils');
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
        logger.debug('Fetching messages with optimized date range method', { dateRange });
        
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
        
        // Check if no messages were found in the requested date range
        if (result.sorted.length === 0) {
          const startDate = new Date(dateRange.startUTC);
          const endDate = new Date(dateRange.endUTC);
          
          // Format dates for user-friendly display
          const formatDate = (date) => {
            return date.toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'numeric', 
              day: 'numeric' 
            });
          };
          
          let dateDisplayText;
          if (startDate.toDateString() === endDate.toDateString()) {
            // Single date
            dateDisplayText = formatDate(startDate);
          } else {
            // Date range
            dateDisplayText = `${formatDate(startDate)} - ${formatDate(endDate)}`;
          }
          
          logger.info(`No messages found for requested date range: ${dateDisplayText}`);
          
          // Add a flag to indicate no messages were found
          result.noMessagesFound = true;
          result.requestedDateRange = dateDisplayText;
        }
        
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
