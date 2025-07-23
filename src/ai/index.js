const openai = require('./openai');
const openrouter = require('./openrouter'); // Add OpenRouter provider

const providers = {
  openai,
  openrouter, // Register OpenRouter provider
  // claude,
  // groq,
  // ...etc
};

module.exports = async function generateReply(finalInput, opts = {}) {
  const name = process.env.AI_PROVIDER || 'openai';
  if (!providers[name]) {
    throw new Error(`AI provider "${name}" not found.`);
  }
  return providers[name](finalInput, opts);
};
