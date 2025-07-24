const { buildOpenAIInput } = require('../utils/messageUtils');
const generateReply = require('../ai');
const config = require('../config/botConfig');
const logger = require('../utils/logger');

class AIService {
  /**
   * Build input for AI based on messages and user prompt
   */
  buildAIInput(messages, userPrompt, botId) {
    try {
      const input = buildOpenAIInput(messages, userPrompt, botId);
      logger.debug(`Built AI input with ${input.length} items`);
      return input;
    } catch (error) {
      logger.error('Failed to build AI input:', { error: error.message });
      throw new Error('Failed to prepare AI input');
    }
  }

  /**
   * Generate AI response from input
   */
  async generateResponse(input, opts = {}) {
    try {
      logger.info('Generating AI response');
      const reply = await generateReply(input, opts);
      
      if (!reply) {
        logger.warn('AI returned empty response');
        throw new Error('AI returned empty response');
      }
      
      logger.info('AI response generated successfully', { 
        length: reply.length,
        provider: config.ai.provider 
      });
      
      return reply;
    } catch (error) {
      logger.error('Failed to generate AI response:', { 
        error: error.message,
        provider: config.ai.provider 
      });
      throw new Error('Failed to generate AI response');
    }
  }

  /**
   * Process complete AI workflow: build input and generate response
   */
  async processAIRequest(messages, userPrompt, botId, opts = {}) {
    try {
      const input = this.buildAIInput(messages, userPrompt, botId);
      const response = await this.generateResponse(input, opts);
      
      return { input, response };
    } catch (error) {
      logger.error('AI processing failed:', { error: error.message });
      throw error;
    }
  }
}

module.exports = new AIService();
