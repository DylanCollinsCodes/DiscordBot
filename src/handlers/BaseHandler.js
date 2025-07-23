const logger = require('../utils/logger');

class BaseHandler {
  constructor(client) {
    this.client = client;
  }

  /**
   * Check if this handler should process the message
   */
  shouldHandle(message) {
    throw new Error('shouldHandle must be implemented by subclass');
  }

  /**
   * Process the message
   */
  async handle(message) {
    throw new Error('handle must be implemented by subclass');
  }

  /**
   * Handle errors gracefully with user feedback
   */
  async handleError(message, error) {
    logger.error('Handler error:', { 
      handler: this.constructor.name,
      messageId: message.id,
      error: error.message 
    });

    try {
      const errorMessage = this.getErrorMessage(error);
      await message.reply(errorMessage);
    } catch (replyError) {
      logger.error('Failed to send error reply:', { error: replyError.message });
    }
  }

  /**
   * Get user-friendly error message
   */
  getErrorMessage(error) {
    // Customize error messages based on error type
    if (error.message.includes('AI')) {
      return "Sorry, I'm having trouble connecting to the AI service. Please try again later.";
    }
    if (error.message.includes('fetch')) {
      return "I couldn't retrieve the conversation messages. Please try again.";
    }
    if (error.message.includes('channel')) {
      return "I'm having trouble accessing the channels. Please check my permissions.";
    }
    
    return "Sorry, I encountered an error while processing your request. Please try again.";
  }
}

module.exports = BaseHandler;
