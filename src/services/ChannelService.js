const config = require('../config/botConfig');
const logger = require('../utils/logger');

class ChannelService {
  constructor(guild) {
    this.guild = guild;
  }

  /**
   * Find a channel by name
   */
  findChannel(channelName) {
    return this.guild.channels.cache.find(
      c => c.name === channelName && c.isTextBased && !c.isThread()
    );
  }

  /**
   * Get the AI channel for posting full responses
   */
  getAIChannel() {
    return this.findChannel(config.channels.ai);
  }

  /**
   * Split message into chunks that fit Discord's limit
   */
  splitMessage(text, maxLength = config.limits.discordMessageLimit) {
    if (text.length <= maxLength) {
      return [text];
    }

    // Try to split at sentence boundaries
    const sentences = text.match(/[^.!?]+[.!?]+[\])'"`'"]*|.+/g) || [text];
    const chunks = [];
    let current = '';

    for (const sentence of sentences) {
      if ((current + sentence).length > maxLength) {
        if (current) {
          chunks.push(current.trim());
        }
        
        // If single sentence is too long, hard split
        if (sentence.length > maxLength) {
          for (let i = 0; i < sentence.length; i += maxLength) {
            chunks.push(sentence.slice(i, i + maxLength));
          }
          current = '';
        } else {
          current = sentence;
        }
      } else {
        current += sentence;
      }
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    return chunks.length > 0 ? chunks : [text];
  }

  /**
   * Generate preview of the message
   */
  generatePreview(text) {
    const firstParagraph = text.split('\n')[0];
    let preview = firstParagraph;
    
    if (preview.length > config.limits.previewLength) {
      preview = text.slice(0, config.limits.previewLength - 1) + '…';
    }
    
    return preview;
  }

  /**
   * Post message to AI channel, splitting if necessary
   */
  async postToAIChannel(aiChannel, message) {
    try {
      const chunks = this.splitMessage(message);
      let firstMessage = null;

      for (let i = 0; i < chunks.length; i++) {
        const sentMessage = await aiChannel.send(chunks[i]);
        if (i === 0) {
          firstMessage = sentMessage;
        }
      }

      logger.info(`Posted message to AI channel in ${chunks.length} chunks`);
      return firstMessage;
    } catch (error) {
      logger.error('Failed to post to AI channel:', { error: error.message });
      throw new Error('Failed to post message to AI channel');
    }
  }

  /**
   * Post preview with jump link to original channel
   */
  async postPreview(originalChannel, aiChannel, fullMessage, jumpMessage) {
    try {
      const preview = this.generatePreview(fullMessage);
      const previewText = `${preview}\n↪️ full answer in <#${aiChannel.id}>: ${jumpMessage.url}`;
      
      await originalChannel.send(previewText);
      logger.info('Posted preview with jump link');
    } catch (error) {
      logger.error('Failed to post preview:', { error: error.message });
      throw new Error('Failed to post preview message');
    }
  }

  /**
   * Post message directly to channel (fallback)
   */
  async postDirectly(channel, message) {
    try {
      const chunks = this.splitMessage(message);
      
      for (const chunk of chunks) {
        await channel.reply(chunk);
      }
      
      logger.info(`Posted message directly in ${chunks.length} chunks`);
    } catch (error) {
      logger.error('Failed to post message directly:', { error: error.message });
      throw new Error('Failed to post message');
    }
  }

  /**
   * Handle the complete response posting workflow
   */
  async handleResponse(originalChannel, response) {
    try {
      const aiChannel = this.getAIChannel();
      
      if (aiChannel) {
        // Post full response in AI channel
        const jumpMessage = await this.postToAIChannel(aiChannel, response);
        
        // Post preview with jump link in original channel
        await this.postPreview(originalChannel, aiChannel, response, jumpMessage);
      } else {
        // Fallback: post directly in original channel
        logger.warn('AI channel not found, posting directly');
        await this.postDirectly(originalChannel, response);
      }
    } catch (error) {
      logger.error('Failed to handle response:', { error: error.message });
      throw error;
    }
  }

  /**
   * Post limit warning message
   */
  async postLimitWarning(channel, dateRange, stopTime) {
    try {
      const startTime = dateRange ? new Date(dateRange.startUTC).toLocaleString() : "?";
      const endTime = stopTime ? stopTime.toLocaleString() : "unknown time";
      
      const warningMessage = `Hit ${config.limits.maxMessagesFetch} message limit. ` +
        `Collected messages from ${startTime} to ${endTime}. ` +
        `Please use a smaller date range.`;
      
      await channel.reply(warningMessage);
      logger.warn('Posted limit warning', { dateRange, stopTime });
    } catch (error) {
      logger.error('Failed to post limit warning:', { error: error.message });
    }
  }

  /**
   * Post error message to user
   */
  async postError(channel, errorMessage = "There was an error processing your request.") {
    try {
      await channel.reply(errorMessage);
      logger.info('Posted error message to user');
    } catch (error) {
      logger.error('Failed to post error message:', { error: error.message });
    }
  }
}

module.exports = ChannelService;
