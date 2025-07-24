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

  // Construct payload based solely on the 'messages' field as per OpenRouter documentation.
  const payload = {
    model: "moonshotai/kimi-k2:freegit ",
    messages: [
      { role: "user", content: trimmedInput }
    ],
    temperature: 1,
    top_p: 1,
    n: 1
  };

  try {
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
    
    // Extract the reply from response.data, aligning with OpenAI's format:
    // The response should have a "choices" array with objects containing a "message" field.
    let reply = null;
    if (
      Array.isArray(response?.data?.choices) &&
      response.data.choices[0]?.message?.content
    ) {
      reply = response.data.choices[0].message.content.trim();
    }
    return reply;
  } catch (error) {
    // Log verbose error details
    console.error("OpenRouter API request failed:");
    if (error.response) {
      // Server responded with a status code outside the range of 2xx
      console.error("Status:", error.response.status);
      console.error("Headers:", JSON.stringify(error.response.headers, null, 2));
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      // No response was received
      console.error("No response received:", error.request);
    } else {
      // Some other error occurred during setup
      console.error("Error message:", error.message);
    }
    throw error;
  }
};
