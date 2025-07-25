const logger = require('./logger');

// Discord epoch - January 1, 2015 UTC (in milliseconds)
const DISCORD_EPOCH = 1420070400000;

/**
 * Convert a date to Discord snowflake ID using proper calculation
 */
function dateToSnowflake(date) {
  try {
    // Ensure we have a valid date
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error(`Invalid date provided: ${date}`);
    }
    
    // Discord epoch check - ensure date is after January 1, 2015
    if (date.getTime() < DISCORD_EPOCH) {
      throw new Error(`Date ${date.toISOString()} is before Discord epoch (2015-01-01)`);
    }
    
    logger.debug(`🔍 Converting date ${date.toISOString()} to snowflake`);
    
    // Calculate milliseconds since Discord epoch
    const timeSinceEpoch = date.getTime() - DISCORD_EPOCH;
    logger.debug(`📊 Time since Discord epoch: ${timeSinceEpoch}ms`);
    
    // Discord snowflake format:
    // 42 bits: timestamp (in ms since Discord epoch)
    // 5 bits: worker id (we'll use 0)
    // 5 bits: process id (we'll use 0)  
    // 12 bits: increment (we'll use 0)
    //
    // Since we're only using timestamp, we multiply by 2^22 (4194304)
    // to shift it to the correct position in the 64-bit integer
    const snowflake = (timeSinceEpoch * 4194304).toString();
    
    logger.debug(`✅ Generated snowflake: ${snowflake}`);
    
    // Validate the result is positive
    if (snowflake.startsWith('-')) {
      throw new Error(`Generated negative snowflake: ${snowflake}`);
    }
    
    return snowflake;
    
  } catch (error) {
    logger.error('❌ Error generating snowflake:', { error: error.message });
    throw error;
  }
}

/**
 * Find an anchor message within the target date range
 */
function findAnchorMessage(messageCollection, startUTC, endUTC) {
  for (const message of messageCollection.values()) {
    const ts = message.createdTimestamp;
    if (ts >= startUTC && ts <= endUTC) {
      return message;
    }
  }
  return null;
}

/**
 * Expand message collection bidirectionally from anchor point
 */
async function expandFromAnchor(channel, anchorMessage, startUTC, endUTC, max) {
  if (!anchorMessage) return { sorted: [], rawLog: [], hitLimit: false, stopTime: null, apiCalls: 0 };

  // Start with only messages that are actually in range - use Map to ensure uniqueness
  let allMessagesMap = new Map();
  let allRaw = [anchorMessage];
  let hitLimit = false;
  let stopTime = null;
  let apiCalls = 0;

  // Only include anchor if it's actually in the target date range
  const anchorTs = anchorMessage.createdTimestamp;
  if (anchorTs >= startUTC && anchorTs <= endUTC) {
    allMessagesMap.set(anchorMessage.id, anchorMessage);
    logger.debug(`⚓ Anchor message IS in target range: ${new Date(anchorTs).toISOString()}`);
  } else {
    logger.debug(`⚓ Anchor message is OUTSIDE target range: ${new Date(anchorTs).toISOString()}, using as navigation point only`);
  }

  logger.debug('🔄 Expanding backward from anchor...');
  
  // Expand backward (older messages)
  let beforeId = anchorMessage.id;
  let reachedStartBoundary = false;
  
  while (allMessagesMap.size < max && !reachedStartBoundary) {
    const batch = await channel.messages.fetch({ limit: 100, before: beforeId });
    apiCalls++;
    logger.debug(`📡 API Call ${apiCalls}: Fetched ${batch.size} messages backward`);
    
    if (batch.size === 0) break;
    
    for (const msg of batch.values()) {
      allRaw.push(msg);
      const ts = msg.createdTimestamp;
      
      // If we've gone before our start date, we're done expanding backward
      if (ts < startUTC) {
        logger.debug(`🛑 Reached start boundary at ${new Date(ts).toISOString()}`);
        reachedStartBoundary = true;
        stopTime = new Date(ts);
        break;
      }
      
      // Only include messages within our target date range (and avoid duplicates)
      if (ts >= startUTC && ts <= endUTC && !allMessagesMap.has(msg.id)) {
        allMessagesMap.set(msg.id, msg);
        if (allMessagesMap.size >= max) {
          hitLimit = true;
          stopTime = new Date(ts);
          logger.debug(`📊 Hit message limit during backward expansion`);
          break;
        }
      }
      
      beforeId = msg.id;
    }
    
    if (hitLimit) break;
  }

  logger.debug('🔄 Expanding forward from anchor...');
  
  // Expand forward (newer messages)
  let afterId = anchorMessage.id;
  let reachedEndBoundary = false;
  
  while (allMessagesMap.size < max && !hitLimit) {
    const batch = await channel.messages.fetch({ limit: 100, after: afterId });
    apiCalls++;
    logger.debug(`📡 API Call ${apiCalls}: Fetched ${batch.size} messages forward`);
    
    if (batch.size === 0) {
      logger.debug(`📭 No more messages available, stopping forward expansion`);
      break;
    }
    
    // Debug: Show timestamp range of this batch
    const batchArray = Array.from(batch.values());
    const firstMsg = batchArray[batchArray.length - 1]; // Oldest in batch (messages are newest first)
    const lastMsg = batchArray[0]; // Newest in batch
    logger.debug(`📅 Forward batch range: ${new Date(firstMsg.createdTimestamp).toISOString()} to ${new Date(lastMsg.createdTimestamp).toISOString()}`);
    logger.debug(`🎯 Target end boundary: ${new Date(endUTC).toISOString()}`);
    
    // Track the newest message ID for pagination (regardless of whether we include it)
    let newestMessageId = null;
    let foundMessagesInRange = false;
    let allMessagesBeyondBoundary = true;
    
    // Process all messages in the batch
    for (const msg of batch.values()) {
      allRaw.push(msg);
      const ts = msg.createdTimestamp;
      
      // Always track the newest message for pagination
      if (!newestMessageId) {
        newestMessageId = msg.id;
      }
      
      // Check if this message is within our target range
      if (ts >= startUTC && ts <= endUTC) {
        allMessagesBeyondBoundary = false;
        foundMessagesInRange = true;
        
        // Include message if not already present (avoid duplicates)
        if (!allMessagesMap.has(msg.id)) {
          allMessagesMap.set(msg.id, msg);
          if (allMessagesMap.size >= max) {
            hitLimit = true;
            stopTime = new Date(ts);
            logger.debug(`📊 Hit message limit during forward expansion`);
            break;
          }
        }
      } else if (ts > endUTC) {
        // Message is beyond our end boundary
        if (!reachedEndBoundary) {
          logger.debug(`🛑 First message beyond end boundary at ${new Date(ts).toISOString()}`);
          reachedEndBoundary = true;
          if (!stopTime) stopTime = new Date(ts);
        }
      } else {
        // Message is before our start boundary (shouldn't happen in forward expansion)
        allMessagesBeyondBoundary = false;
      }
    }
    
    // Update afterId to the newest message in the batch for proper pagination
    if (newestMessageId) {
      afterId = newestMessageId;
      logger.debug(`🔄 Updated afterId to: ${afterId} for next pagination`);
    }
    
    // Stop if we hit the message limit
    if (hitLimit) break;
    
    // Stop if ALL messages in this batch were beyond the end boundary
    // This means we've completely passed our target date range
    if (allMessagesBeyondBoundary && reachedEndBoundary) {
      logger.debug(`🏁 All messages in batch beyond target range, stopping expansion`);
      break;
    }
  }

  // Convert Map values back to array and sort
  const allMessages = Array.from(allMessagesMap.values());
  const sorted = allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  
  logger.debug(`📊 Expansion complete: ${sorted.length} messages collected with ${apiCalls} API calls`);
  logger.debug(`📅 Target range: ${new Date(startUTC).toISOString()} to ${new Date(endUTC).toISOString()}`);
  
  if (sorted.length > 0) {
    logger.debug(`📅 Actual range: ${new Date(sorted[0].createdTimestamp).toISOString()} to ${new Date(sorted[sorted.length-1].createdTimestamp).toISOString()}`);
  } else {
    logger.debug(`📅 No messages found in target date range`);
  }
  
  return { sorted, rawLog: allRaw, hitLimit, stopTime, apiCalls };
}

/**
 * Optimized message fetching using snowflake calculation
 */
async function fetchMessagesOptimized(channel, { startUTC, endUTC, max = 1000 }) {
  const startTime = Date.now();
  let apiCallCount = 0;
  
  try {
    logger.info('🚀 OPTIMIZED FETCH STARTED');
    logger.info(`📅 Date range: ${new Date(startUTC).toISOString()} to ${new Date(endUTC).toISOString()}`);
    
    // Calculate snowflake for the middle of our date range
    const midDate = new Date((startUTC + endUTC) / 2);
    const targetSnowflake = dateToSnowflake(midDate);
    
    logger.debug(`🔍 Calculated target snowflake: ${targetSnowflake} for ${midDate.toISOString()}`);
    
    // Jump to approximate location using 'around'
    logger.debug('📡 API Call 1: Fetching initial batch with around parameter');
    const initialBatch = await channel.messages.fetch({ 
      around: targetSnowflake, 
      limit: 100 
    });
    apiCallCount++;
    
    logger.debug(`📦 Initial batch size: ${initialBatch.size} messages`);
    
    // Find an anchor message within our date range
    const anchorMessage = findAnchorMessage(initialBatch, startUTC, endUTC);
    
    if (anchorMessage) {
      logger.debug(`⚓ Found anchor message: ${anchorMessage.id} at ${new Date(anchorMessage.createdTimestamp).toISOString()}`);
      
      // We found a message in our target range, expand from there
      const result = await expandFromAnchor(channel, anchorMessage, startUTC, endUTC, max);
      
      const totalTime = Date.now() - startTime;
      logger.info(`✅ OPTIMIZED FETCH COMPLETED: ${result.sorted.length} messages in ${totalTime}ms with ${apiCallCount + result.apiCalls || 0} API calls`);
      
      return { ...result, apiCalls: apiCallCount + (result.apiCalls || 0), fetchTime: totalTime };
    } else {
      // No messages found in initial batch, try expanding search window
      let searchAttempts = 0;
      const maxAttempts = 3;
      
      while (searchAttempts < maxAttempts) {
        // Try searching with wider windows
        const expandedStart = startUTC - (24 * 60 * 60 * 1000); // 1 day before
        const expandedEnd = endUTC + (24 * 60 * 60 * 1000); // 1 day after
        
        const expandedSnowflake = dateToSnowflake(new Date((expandedStart + expandedEnd) / 2));
        const expandedBatch = await channel.messages.fetch({ 
          around: expandedSnowflake, 
          limit: 100 
        });
        
        // Look for any message near our date range
        let nearestMessage = null;
        let nearestDistance = Infinity;
        
        for (const message of expandedBatch.values()) {
          const ts = message.createdTimestamp;
          const distance = Math.min(Math.abs(ts - startUTC), Math.abs(ts - endUTC));
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestMessage = message;
          }
        }
        
        if (nearestMessage) {
          return await expandFromAnchor(channel, nearestMessage, startUTC, endUTC, max);
        }
        
        searchAttempts++;
      }
      
      // Fallback to linear search if optimized approach fails
      const totalTime = Date.now() - startTime;
      logger.warn(`⚠️ No anchor found after ${searchAttempts} attempts, falling back to linear search after ${totalTime}ms`);
      
      const fallbackStart = Date.now();
      const result = await fetchMessages(channel, { startUTC, endUTC, max });
      const fallbackTime = Date.now() - fallbackStart;
      
      logger.info(`🔄 FALLBACK COMPLETED: ${result.sorted.length} messages in ${fallbackTime}ms (total: ${totalTime + fallbackTime}ms)`);
      return { ...result, fetchTime: totalTime + fallbackTime, usedFallback: true };
    }
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logger.error('❌ Error in optimized fetch, falling back to linear search:', { error: error.message });
    
    const fallbackStart = Date.now();
    const result = await fetchMessages(channel, { startUTC, endUTC, max });
    const fallbackTime = Date.now() - fallbackStart;
    
    logger.info(`🔄 ERROR FALLBACK COMPLETED: ${result.sorted.length} messages in ${fallbackTime}ms (total: ${totalTime + fallbackTime}ms)`);
    return { ...result, fetchTime: totalTime + fallbackTime, usedFallback: true, hadError: true };
  }
}

/**
 * More robust date parsing that handles various date formats
 */
function parseDate(dateStr) {
  logger.debug(`🔍 Parsing date string: "${dateStr}"`);
  
  if (dateStr.toLowerCase() === "today") {
    const now = new Date();
    logger.debug(`📅 Parsed "today" as: ${now.toISOString()}`);
    return now;
  }

  // Try different date parsing approaches
  let parsedDate = null;
  
  // Method 1: Direct Date constructor
  parsedDate = new Date(dateStr);
  if (!isNaN(parsedDate)) {
    logger.debug(`✅ Method 1 (Date constructor) successful: ${parsedDate.toISOString()}`);
    return parsedDate;
  }
  
  // Method 2: Handle MM/DD/YYYY format explicitly
  const mmddyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    const [, month, day, year] = mmddyyyy;
    parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(parsedDate)) {
      logger.debug(`✅ Method 2 (MM/DD/YYYY parsing) successful: ${parsedDate.toISOString()}`);
      return parsedDate;
    }
  }
  
  // Method 3: Handle DD/MM/YYYY format as fallback
  if (mmddyyyy) {
    const [, first, second, year] = mmddyyyy;
    // If first number > 12, assume DD/MM/YYYY format
    if (parseInt(first) > 12) {
      parsedDate = new Date(parseInt(year), parseInt(second) - 1, parseInt(first));
      if (!isNaN(parsedDate)) {
        logger.debug(`✅ Method 3 (DD/MM/YYYY parsing) successful: ${parsedDate.toISOString()}`);
        return parsedDate;
      }
    }
  }
  
  logger.error(`❌ Failed to parse date: "${dateStr}"`);
  return null;
}

function parseDateRange(content) {
  logger.debug(`🔍 Parsing date range from content: "${content}"`);
  
  const dateRangeMatch = content.match(/\{\s*([0-9/]+|Today)(?:\s*-\s*([0-9/]+|Today))?\s*\}/i);
  if (!dateRangeMatch) {
    logger.debug('❌ No date range pattern found');
    return null;
  }
  
  const startDateStr = dateRangeMatch[1];
  let endDateStr = dateRangeMatch[2];
  
  logger.debug(`📅 Extracted date strings: start="${startDateStr}", end="${endDateStr || 'same as start'}"`);
  
  let startUTC, endUTC;
  
  if (!endDateStr) {
    // Single date or { Today }
    const parsedDate = parseDate(startDateStr);
    if (!parsedDate) {
      logger.error(`❌ Failed to parse start date: "${startDateStr}"`);
      return null;
    }
    
    // Create start and end of day boundaries
    const localStart = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 0, 0, 0, 0);
    const localEnd = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 23, 59, 59, 999);
    startUTC = localStart.getTime();
    endUTC = localEnd.getTime();
    
    logger.debug(`📅 Single date range: ${localStart.toISOString()} to ${localEnd.toISOString()}`);
  } else {
    // Date range
    const startDate = parseDate(startDateStr);
    const endDate = parseDate(endDateStr);
    
    if (!startDate || !endDate) {
      logger.error(`❌ Failed to parse date range: start="${startDateStr}" (${startDate}), end="${endDateStr}" (${endDate})`);
      return null;
    }
    
    const leftStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0, 0);
    let rightEnd;
    if (endDateStr.toLowerCase() === "today") {
      rightEnd = endDate; // Keep the current time for "today"
    } else {
      rightEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999);
    }
    
    startUTC = leftStart.getTime();
    endUTC = rightEnd.getTime();
    
    logger.debug(`📅 Date range: ${leftStart.toISOString()} to ${rightEnd.toISOString()}`);
  }
  
  // Validate the date range makes sense
  if (startUTC > endUTC) {
    logger.error(`❌ Invalid date range: start (${new Date(startUTC).toISOString()}) is after end (${new Date(endUTC).toISOString()})`);
    return null;
  }
  
  logger.debug(`✅ Successfully parsed date range: ${new Date(startUTC).toISOString()} to ${new Date(endUTC).toISOString()}`);
  return { startUTC, endUTC };
}

async function fetchMessages(channel, { startUTC, endUTC, max = 1000 }) {
  let allMessagesMap = new Map(); // Use Map to ensure unique messages by ID
  let allRaw = [];
  let beforeId = undefined;
  let hitLimit = false;
  let stopTime = null;

  while (allMessagesMap.size < max) {
    const batch = await channel.messages.fetch({ limit: 100, before: beforeId });
    if (batch.size === 0) break;
    allRaw.push(...batch.values());
    let kept = 0;
    for (const msg of batch.values()) {
      const ts = msg.createdTimestamp;
      if (ts < startUTC) {
        stopTime = new Date(ts);
        break;
      }
      if (ts > endUTC) {
        beforeId = msg.id;
        continue;
      }
      // Only add if not already present (ensures uniqueness by ID)
      if (!allMessagesMap.has(msg.id)) {
        allMessagesMap.set(msg.id, msg);
        kept++;
        if (allMessagesMap.size >= max) {
          hitLimit = true;
          stopTime = new Date(ts);
          break;
        }
      }
      beforeId = msg.id;
    }
    if (hitLimit) break;
    if (batch.size > 0 && batch.last().createdTimestamp < startUTC) break;
  }
  
  // Convert Map values back to array and sort
  const allMessages = Array.from(allMessagesMap.values());
  const sorted = allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  return { sorted, rawLog: allRaw, hitLimit, stopTime };
}

function buildOpenAIInput(sorted, userPrompt, botId) {
  const input = sorted.map(msg => {
    const username = msg.author?.username || msg.author?.id || "unknown";
    const date = new Date(msg.createdTimestamp);
    const dateStr = date.toISOString().replace('T', ' ').slice(0, 16);
    let text = msg.id === botId
      ? userPrompt
      : `[${username} @ ${dateStr}] ${msg.content}`;
    return {
      role: "user",
      content: [
        {
          type: "input_text",
          text: text
        }
      ]
    };
  });

  const systemMessage = {
    role: "system",
    content: [
      {
        type: "input_text",
        text: userPrompt
      }
    ]
  };

  return [systemMessage, ...input];
}

module.exports = {
  DISCORD_EPOCH,
  parseDateRange,
  fetchMessages,
  fetchMessagesOptimized,
  buildOpenAIInput
};
