const BaseHandler = require('./BaseHandler');
const MessageService = require('../services/MessageService');
const AIService = require('../services/AIService');
const ChannelService = require('../services/ChannelService');
const logger = require('../utils/logger');

class MentionHandler extends BaseHandler {
  constructor(client) {
    super(client);
  }

  /**
   * Check if message mentions the bot (user or role) and is from a human
   */
  shouldHandle(message) {
    const mentionsBot = message.mentions.has(this.client.user);
    const isNotBot = !message.author.bot;
    
    // Check for role mentions that might represent the bot (like @ChatGPT role)
    const mentionsRole = message.mentions.roles.some(role => 
      role.name.toLowerCase().includes('chatgpt') || 
      role.name.toLowerCase().includes('gpt') ||
      role.name.toLowerCase().includes('ai')
    );
    
    const shouldHandle = (mentionsBot || mentionsRole) && isNotBot;
    
    logger.debug('MentionHandler shouldHandle check:', {
      messageId: message.id,
      mentionsBot,
      mentionsRole,
      isNotBot,
      shouldHandle,
      botId: this.client.user.id,
      botTag: this.client.user.tag,
      mentions: message.mentions.users.map(user => ({ id: user.id, tag: user.tag })),
      roleMentions: message.mentions.roles.map(role => ({ id: role.id, name: role.name })),
      content: message.content.substring(0, 200)
    });
    
    return shouldHandle;
  }

  /**
   * Handle the mention by processing the conversation and generating AI response
   */
  async handle(message) {
    try {
      logger.info('Processing mention', { 
        messageId: message.id,
        authorId: message.author.id,
        channelId: message.channel.id,
        content: message.content
      });

      // Initialize services
      logger.debug('Initializing services...');
      const messageService = new MessageService(message.channel);
      const channelService = new ChannelService(message.guild);
      logger.debug('Services initialized successfully');

      // Parse date range from message
      logger.debug('Parsing date range from message...');
      const dateRange = messageService.parseDateRange(message.content);
      logger.debug('Date range parsed:', dateRange);
      
      // Fetch messages for context
      logger.debug('Fetching messages for context...');
      const { sorted, rawLog, hitLimit, stopTime, noMessagesFound, requestedDateRange } = await messageService
        .fetchMessagesForContext(dateRange);
      logger.debug('Messages fetched:', {
        sortedCount: sorted.length,
        rawLogCount: rawLog.length,
        hitLimit,
        stopTime,
        noMessagesFound
      });

      // Check if no messages were found for the requested date range
      if (noMessagesFound) {
        logger.info('No messages found for requested date range, sending user notification', {
          requestedDateRange,
          messageId: message.id
        });
        
        const noMessagesResponse = `I couldn't find any messages from ${requestedDateRange}. Please check the date format and try again.`;
        await message.reply(noMessagesResponse);
        
        logger.info('No messages notification sent successfully');
        return; // Exit early, don't process AI request
      }

      // Extract user prompt
      logger.debug('Extracting user prompt...');
      const userPrompt = messageService.extractUserPrompt(
        message.content, 
        this.client.user.id
      );
      logger.debug('User prompt extracted:', { userPrompt });

      // Process AI request
      logger.debug('Processing AI request...');
      const { input: aiInput, response } = await AIService.processAIRequest(
        sorted,
        userPrompt,
        this.client.user.id,
        { sendMessage: (msg) => message.channel.send(msg) }
      );
      logger.debug('AI request processed successfully');

      // Write debug files if enabled
      logger.debug('Writing debug files...');
      messageService.writeDebugFiles(rawLog, aiInput);
      logger.debug('Debug files written');

      // Log processing details
      logger.info('AI processing completed', {
        inputLength: aiInput.length,
        responseLength: response.length,
        userPrompt
      });

      // Handle response posting
      logger.debug('Posting response to channel...');
      await channelService.handleResponse(message.channel, response);
      logger.debug('Response posted successfully');

      // Post limit warning if necessary
      if (hitLimit) {
        logger.debug('Posting limit warning...');
        await channelService.postLimitWarning(message.channel, dateRange, stopTime, sorted);
        logger.debug('Limit warning posted');
      }

      logger.info('Mention processing completed successfully');

    } catch (error) {
      logger.error('Error in MentionHandler.handle:', {
        messageId: message.id,
        error: error.message,
        stack: error.stack
      });
      await this.handleError(message, error);
    }
  }
}

module.exports = MentionHandler;
