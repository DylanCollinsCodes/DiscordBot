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
   * Check if message mentions the bot and is from a human
   */
  shouldHandle(message) {
    return message.mentions.has(this.client.user) && !message.author.bot;
  }

  /**
   * Handle the mention by processing the conversation and generating AI response
   */
  async handle(message) {
    try {
      logger.info('Processing mention', { 
        messageId: message.id,
        authorId: message.author.id,
        channelId: message.channel.id
      });

      // Initialize services
      const messageService = new MessageService(message.channel);
      const channelService = new ChannelService(message.guild);

      // Parse date range from message
      const dateRange = messageService.parseDateRange(message.content);
      
      // Fetch messages for context
      const { sorted, rawLog, hitLimit, stopTime } = await messageService
        .fetchMessagesForContext(dateRange);

      // Extract user prompt
      const userPrompt = messageService.extractUserPrompt(
        message.content, 
        this.client.user.id
      );

      // Process AI request with sendMessage callback for debug mode
      const { input: aiInput, response } = await AIService.processAIRequest(
        sorted,
        userPrompt,
        this.client.user.id,
        { sendMessage: (msg) => message.channel.send(msg) }
      );

      // Write debug files if enabled
      messageService.writeDebugFiles(rawLog, aiInput);

      // Log processing details
      logger.info('AI processing completed', {
        inputLength: aiInput.length,
        responseLength: response.length,
        userPrompt
      });

      // Handle response posting - this already includes batching via ChannelService
      await channelService.handleResponse(message.channel, response);

      // Post limit warning if necessary
      if (hitLimit) {
        await channelService.postLimitWarning(message.channel, dateRange, stopTime);
      }

      logger.info('Mention processing completed successfully');

    } catch (error) {
      await this.handleError(message, error);
    }
  }
}

module.exports = MentionHandler;
