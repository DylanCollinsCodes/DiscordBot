const axios = require('axios');

module.exports = async function generateOpenRouterReply(finalInput, opts = {}) {
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: "qwen/qwen3-235b-a22b-07-25:free",
      messages: [
        { role: "user", content: finalInput }
      ],
      temperature: 1,
      max_tokens: 32768,
      top_p: 1
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  // Extract reply from response.data.choices[0].message.content
  let reply = null;
  if (
    Array.isArray(response?.data?.choices) &&
    response.data.choices[0]?.message?.content
  ) {
    reply = response.data.choices[0].message.content.trim();
  }
  return reply;
};
