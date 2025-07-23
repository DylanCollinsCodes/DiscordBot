const openai = require('./openai');
// In the future, add: const claude = require('./claude'); etc.

const providers = {
  openai,
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
