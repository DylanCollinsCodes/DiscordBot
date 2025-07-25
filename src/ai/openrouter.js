const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Generate a reply via OpenRouter using structured AI input.
 * Reuses the same input format produced by messageUtils.buildOpenAIInput.
 */
module.exports = async function generateOpenRouterReply(finalInput, opts = {}) {
  // Convert structured input into messages array
  const messages = finalInput.map(item => {
    let contentText = '';
    if (Array.isArray(item.content)) {
      contentText = item.content.map(c => c.text).join('\n');
    } else {
      contentText = String(item.content);
    }
    return { role: item.role, content: contentText };
  });

  // Build payload with optional overrides from opts
  const payload = {
    model: opts.model || 'tngtech/deepseek-r1t-chimera:free',
    messages,
    temperature: opts.temperature ?? 1,
    top_p: opts.top_p ?? 1,
    n: opts.n ?? 1
  };

  logger.debug("OpenRouter Request Payload:", payload);

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      payload,
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    logger.debug("OpenRouter Response Data:", response.data);

    const reply = response.data?.choices?.[0]?.message?.content?.trim();
    return reply;
  } catch (error) {
    logger.error("OpenRouter API request failed:");
    if (error.response) {
      logger.error("Status:", error.response.status);
      logger.error("Headers:", JSON.stringify(error.response.headers, null, 2));
      logger.error("Data:", JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      logger.error("No response received:", error.request);
    } else {
      logger.error("Error message:", error.message);
    }
    throw error;
  }
};
