module.exports = {
  // Message limits
  MAX_MESSAGES_FETCH: 1000,
  BATCH_SIZE: 100,
  DISCORD_MESSAGE_LIMIT: 2000,
  
  // Context limits
  DEFAULT_CONTEXT_MESSAGES: 25,
  PREVIEW_LENGTH: 250,
  PREVIEW_TRUNCATE_SUFFIX: '…',
  
  // Channel names
  DEFAULT_AI_CHANNEL: 'ai',
  DEFAULT_GENERAL_CHANNEL: 'general',
  
  // File paths
  DEBUG_FETCHED_FILE: 'fetched-debug.json',
  DEBUG_INPUT_FILE: 'input-debug.json',
  
  // AI defaults
  DEFAULT_AI_PROVIDER: 'openai',
  DEFAULT_USER_PROMPT: "Summarize the conversation.",
  
  // Discord intents
  REQUIRED_INTENTS: [
    'Guilds',
    'GuildMessages', 
    'MessageContent'
  ]
};
