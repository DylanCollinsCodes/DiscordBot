const OpenAI = require("openai");

module.exports = async function generateOpenAIReply(finalInput) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await openai.responses.create({
    model: "gpt-4.1-nano",
    input: finalInput,
    text: {
      format: {
        type: "text"
      }
    },
    reasoning: {},
    tools: [],
    temperature: 1,
    max_output_tokens: 32768,
    top_p: 1,
    store: false
  });

  // Extract reply from response.output[0].content[0].text
  let reply = null;
  if (
    Array.isArray(response?.output) &&
    response.output[0]?.content &&
    Array.isArray(response.output[0].content) &&
    response.output[0].content[0]?.text
  ) {
    reply = response.output[0].content[0].text.trim();
  }
  return reply;
};
