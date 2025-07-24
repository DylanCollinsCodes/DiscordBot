const axios = require('axios');

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
    model: opts.model || 'moonshotai/kimi-k2:freegit ',
    messages,
    temperature: opts.temperature ?? 1,
    top_p: opts.top_p ?? 1,
    n: opts.n ?? 1
  };

  console.debug("OpenRouter Request Payload:", JSON.stringify(payload, null, 2));

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

    console.debug("OpenRouter Response Data:", JSON.stringify(response.data, null, 2));

    const reply = response.data?.choices?.[0]?.message?.content?.trim();
    return reply;
  } catch (error) {
    console.error("OpenRouter API request failed:");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Headers:", JSON.stringify(error.response.headers, null, 2));
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error("No response received:", error.request);
    } else {
      console.error("Error message:", error.message);
    }
    throw error;
  }
};
