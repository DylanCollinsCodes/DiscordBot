const axios = require('axios');

module.exports = async function generateOpenRouterReply(finalInput, opts = {}) {
  let processedInput = "";

  // If finalInput is an array, process each item, otherwise convert to string
  if (Array.isArray(finalInput)) {
    processedInput = finalInput.map(item => {
      if (typeof item === 'object' && item !== null) {
        // If item has a 'content' field, use it; otherwise, fall back to JSON stringification
        if (item.content) {
          if (typeof item.content === 'string') {
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

  // Ensure the processed input is not empty after conversion
  if (!processedInput || processedInput.trim().length === 0) {
    const errMsg = "generateOpenRouterReply: processed input is empty.";
    console.error(errMsg);
    throw new Error(errMsg);
  }

  // Log the processed input for debugging
  const trimmedInput = processedInput.trim();
  console.debug("Final processed input (trimmed):", trimmedInput);
  console.debug("Final processed input length:", trimmedInput.length);

  // Truncate input to stay within OpenRouter's 2000 character limit
  const maxInputLength = 2000;
  const truncatedInput = trimmedInput.length > maxInputLength 
    ? trimmedInput.substring(0, maxInputLength) 
    : trimmedInput;

  if (truncatedInput !== trimmedInput) {
    console.warn(`Input truncated from ${trimmedInput.length} to ${truncatedInput.length} characters to meet OpenRouter API limits.`);
  }

  // Construct payload based solely on the 'messages' field as per OpenRouter documentation.
  const payload = {
    model: "tngtech/deepseek-r1t2-chimera:free",
    messages: [
      { role: "user", content: truncatedInput }
    ],
    temperature: 1,
    top_p: 1,
    n: 1
  };

  try {
      if (process.env.DEBUG_OPENROUTER === 'true') {
          // Ensure sendMessage callback is available; otherwise, default to logging
          if (!opts.sendMessage || typeof opts.sendMessage !== 'function') {
              opts.sendMessage = async (msg) => { console.log("Chat output:", msg); };
          }
          const debugModels = [
              "moonshotai/kimi-dev-72b:free",
              "deepseek/deepseek-r1t2-qwen3-8b:free",
              "deepseek/deepseek-r1t2:free",
              "qwen/qwen3-235b-a22b:free",
              "tngtech/deepseek-r1t-chimera:free",
              "microsoft/mai-ds-r1:free"
          ];
          let responses = [];
          const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
          for (const model of debugModels) {
              console.debug("Debug Mode: Testing with model:", model);
              payload.model = model;
              try {
                  console.debug("OpenRouter Request Payload for model " + model + ":", JSON.stringify(payload, null, 2));
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
                  console.debug("OpenRouter Response Data for model " + model + ":", JSON.stringify(response.data, null, 2));
                  let reply = null;
                  if (
                    Array.isArray(response?.data?.choices) &&
                    response.data.choices[0]?.message?.content
                  ) {
                    reply = response.data.choices[0].message.content.trim();
                  }
                  const message = `Model ${model}: ${reply ? reply : "No reply"}`;
                  // Send message immediately to chat, ensuring it's split if too long
                  if (message.length > 1800) {
                    // Split on sentence boundaries first, then by length
                    const sentences = message.match(/[^.!?]+[.!?]+[\])'"`'"]*|.+/g) || [message];
                    const chunks = [];
                    let current = '';
                    
                    for (const sentence of sentences) {
                      if ((current + sentence).length > 1800) {
                        if (current) {
                          chunks.push(current.trim());
                        }
                        
                        // If single sentence is too long, hard split
                        if (sentence.length > 1800) {
                          for (let i = 0; i < sentence.length; i += 1800) {
                            chunks.push(sentence.slice(i, i + 1800));
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
                    
                    for (const chunk of chunks) {
                      await opts.sendMessage(chunk);
                      await sleep(1000); // Brief pause between chunks
                    }
                  } else {
                    await opts.sendMessage(message);
                  }
                  responses.push(message);
              } catch (error) {
                  console.error(`Error with model ${model}:`, error);
                  const message = `Model ${model}: Error occurred`;
                  await opts.sendMessage(message);
                  responses.push(message);
              }
              await sleep(5000);
          }
          // Return the aggregated response for the final preview and link
          return responses.join("\n\n");
      } else {
          console.debug("OpenRouter Request Payload:", JSON.stringify(payload, null, 2));
          
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
          
          let reply = null;
          if (
            Array.isArray(response?.data?.choices) &&
            response.data.choices[0]?.message?.content
          ) {
            reply = response.data.choices[0].message.content.trim();
          }
          
          // If sendMessage callback is provided, use it to send the reply (for debug mode batching)
          if (opts.sendMessage && typeof opts.sendMessage === 'function' && reply) {
            await opts.sendMessage(reply);
          }
          
          return reply;
      }
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
