const OpenAI = require("openai");

module.exports = async function generateOpenAIReply(finalInput) {
  let processedInput = "";
  if (Array.isArray(finalInput)) {
    processedInput = finalInput.map(item => {
      if (typeof item === "object" && item !== null) {
        if (item.content) {
          if (typeof item.content === "string") {
            return item.content;
          } else {
            return JSON.stringify(item.content);
          }
        } else {
          return JSON.stringify(item);
        }
      }
      return String(item);
    }).join("\n");
  } else {
    processedInput = String(finalInput);
  }
  
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
