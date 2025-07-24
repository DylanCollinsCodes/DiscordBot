const logger = require('./logger');

// Discord epoch - January 1, 2015 UTC (in milliseconds)
const DISCORD_EPOCH = 1420070400000;

// Set to track processed message IDs to prevent duplicates
const processedMessageIds = new Set();

/**
 * Determine if a date is in Eastern Daylight Time (EDT)
 * EDT starts on second Sunday of March and ends on first Sunday of November
 */
function isEDT(date) {
  const year = date.getFullYear();
  
  // Calculate second Sunday of March
  const march = new Date(year, 2, 1); // March 1st
  const dayOfWeek = march.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const secondSundayMarch = 14 - dayOfWeek; // Second Sunday
  const dstStart = new Date(year, 2, secondSundayMarch, 2); // 2 AM on second Sunday
  
  // Calculate first Sunday of November
  const november = new Date(year, 10, 1); // November 1st
  const dayOfWeekNov = november.getDay();
  const firstSundayNovember = 1 + (7 - dayOfWeekNov); // First Sunday
  const dstEnd = new Date(year, 10, firstSundayNovember, 2); // 2 AM on first Sunday
  
  // Check if date is between DST start and end
  return date >= dstStart && date < dstEnd;
}

/**
 * Convert a date from America/New_York time to UTC
 * America/New_York is UTC-5 for EST, UTC-4 for EDT
 */
function nyToUTC(nyDate) {
  if (!(nyDate instanceof Date) || isNaN(nyDate.getTime())) {
    throw new Error(`Invalid date provided: ${nyDate}`);
  }
  
  // Determine if the date is in EDT (UTC-4) or EST (UTC-5)
  const offset = isEDT(nyDate) ? 4 : 5; // hours
  
  // Convert to UTC by adding the offset
  return new Date(nyDate.getTime() + (offset * 60 * 60 * 1000));
}

/**
 * Convert a date from UTC to America/New_York time
 * For debugging and logging purposes
 */
function utcToNY(utcDate) {
  if (!(utcDate instanceof Date) || isNaN(utcDate.getTime())) {
    throw new Error(`Invalid date provided: ${utcDate}`);
  }
  
  // Determine if the UTC date corresponds to EDT or EST in New York
  // Create a date in New York time by subtracting potential offsets and checking
  const estDate = new Date(utcDate.getTime() - (5 * 60 * 60 * 1000));
  const edtDate = new Date(utcDate.getTime() - (4 * 60 * 60 * 1000));
  
  // Check if the EDT date would be in EDT period
  if (isEDT(edtDate)) {
    return edtDate;
  } else {
    return estDate;
  }
}

/**
 * Convert a date to Discord snowflake ID using proper calculation
 * Expects date to be in UTC
 */
function dateToSnowflake(date) {
  try {
    // Ensure we have a valid date
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error(`Invalid date provided: ${date}`);
    }
    
    // Verify the date is in UTC by checking if getUTCHours equals getHours
    // This is a best-effort check - it's not foolproof but helps catch obvious issues
    if (date.getUTCHours() !== date.getHours() || 
        date.getUTCMinutes() !== date.getMinutes() || 
        date.getUTCSeconds() !== date.getSeconds()) {
      logger.warn(`⚠️ Date provided to dateToSnowflake is not in UTC: ${date.toISOString()}`);
      // Convert to UTC for safety
      date = new Date(date.getTime() + (date.getTimezoneOffset() * 60 * 1000));
      logger.debug(`🔄 Converted to UTC: ${date.toISOString()}`);
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

  // Start with only messages that are actually in range
  let allMessages = [];
  let allRaw = [anchorMessage];
  let hitLimit = false;
  let stopTime = null;
  let apiCalls = 0;

  // Only include anchor if it's actually in the target date range
  const anchorTs = anchorMessage.createdTimestamp;
  if (anchorTs >= startUTC && anchorTs <= endUTC) {
    allMessages.push(anchorMessage);
    logger.debug(`⚓ Anchor message IS in target range: ${new Date(anchorTs).toISOString()}`);
  } else {
    logger.debug(`⚓ Anchor message is OUTSIDE target range: ${new Date(anchorTs).toISOString()}, using as navigation point only`);
  }

  logger.debug('🔄 Expanding backward from anchor...');
  
  // Expand backward (older messages)
  let beforeId = anchorMessage.id;
  let reachedStartBoundary = false;
  
  while (allMessages.length < max && !reachedStartBoundary) {
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
      
      // Only include messages within our target date range
      if (ts >= startUTC && ts <= endUTC) {
        allMessages.push(msg);
        if (allMessages.length >= max) {
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
  
  while (allMessages.length < max && !reachedEndBoundary && !hitLimit) {
    const batch = await channel.messages.fetch({ limit: 100, after: afterId });
    apiCalls++;
    logger.debug(`📡 API Call ${apiCalls}: Fetched ${batch.size} messages forward`);
    
    if (batch.size === 0) break;
    
    for (const msg of batch.values()) {
      allRaw.push(msg);
      const ts = msg.createdTimestamp;
      
      // If we've gone past our end date, we're done expanding forward
      if (ts > endUTC) {
        logger.debug(`🛑 Reached end boundary at ${new Date(ts).toISOString()}`);
        reachedEndBoundary = true;
        if (!stopTime) stopTime = new Date(ts);
        break;
      }
      
      // Only include messages within our target date range
      if (ts >= startUTC && ts <= endUTC) {
        allMessages.push(msg);
        if (allMessages.length >= max) {
          hitLimit = true;
          stopTime = new Date(ts);
          logger.debug(`📊 Hit message limit during forward expansion`);
          break;
        }
      }
      
      afterId = msg.id;
    }
    
    if (hitLimit) break;
  }

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
    // For "today", create date boundaries in America/New_York time first
    const now = new Date();
    // Get current time in America/New_York
    const nyOffset = now.getTimezoneOffset() + (isEDT(now) ? 240 : 300); // Adjust for EDT/EST
    const nyTime = new Date(now.getTime() + (nyOffset * 60 * 1000));
    
    // Create start of day in America/New_York time
    const nyStart = new Date(nyTime.getFullYear(), nyTime.getMonth(), nyTime.getDate(), 0, 0, 0, 0);
    // Convert to UTC
    const utcStart = nyToUTC(nyStart);
    
    logger.debug(`📅 Parsed "today" as: ${nyStart.toISOString()} (NY) -> ${utcStart.toISOString()} (UTC)`);
    return utcStart;
  }

  // Try different date parsing approaches
  let parsedDate = null;
  
  // Method 1: Direct Date constructor
  // First try to parse as-is, but interpret as America/New_York time
  parsedDate = new Date(dateStr);
  if (!isNaN(parsedDate)) {
    // If the date string includes timezone info, it's already properly parsed
    if (dateStr.match(/[+-]\d{2}:?\d{2}|Z$/)) {
      logger.debug(`✅ Method 1 (Date constructor with timezone) successful: ${parsedDate.toISOString()}`);
      return parsedDate;
    }
    
    // Otherwise, assume it's America/New_York time and convert to UTC
    const utcDate = nyToUTC(parsedDate);
    logger.debug(`✅ Method 1 (Date constructor) successful: ${parsedDate.toISOString()} (NY) -> ${utcDate.toISOString()} (UTC)`);
    return utcDate;
  }
  
  // Method 2: Handle MM/DD/YYYY format explicitly
  const mmddyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    const [, month, day, year] = mmddyyyy;
    parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 0, 0, 0, 0);
    if (!isNaN(parsedDate)) {
      const utcDate = nyToUTC(parsedDate);
      logger.debug(`✅ Method 2 (MM/DD/YYYY parsing) successful: ${parsedDate.toISOString()} (NY) -> ${utcDate.toISOString()} (UTC)`);
      return utcDate;
    }
  }
  
  // Method 3: Handle DD/MM/YYYY format as fallback
  if (mmddyyyy) {
    const [, first, second, year] = mmddyyyy;
    // If first number > 12, assume DD/MM/YYYY format
    if (parseInt(first) > 12) {
      parsedDate = new Date(parseInt(year), parseInt(second) - 1, parseInt(first), 0, 0, 0, 0);
      if (!isNaN(parsedDate)) {
        const utcDate = nyToUTC(parsedDate);
        logger.debug(`✅ Method 3 (DD/MM/YYYY parsing) successful: ${parsedDate.toISOString()} (NY) -> ${utcDate.toISOString()} (UTC)`);
        return utcDate;
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
    if (startDateStr.toLowerCase() === "today") {
      // Special handling for "today" to ensure proper day boundaries in America/New_York time
      const now = new Date();
      
      // Create start of day in America/New_York time (midnight)
      const nyStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      
      // Create end of day in America/New_York time (current time)
      const nyEnd = now;
      
      // Convert both boundaries to UTC
      const utcStart = nyToUTC(nyStart);
      const utcEnd = nyToUTC(nyEnd);
      
      startUTC = utcStart.getTime();
      endUTC = utcEnd.getTime();
      
      logger.debug(`📅 Single date range (today): ${nyStart.toISOString()} (NY) -> ${nyEnd.toISOString()} (NY) converted to ${utcStart.toISOString()} (UTC) -> ${utcEnd.toISOString()} (UTC)`);
    } else {
      // Regular date parsing
      const parsedDate = parseDate(startDateStr);
      if (!parsedDate) {
        logger.error(`❌ Failed to parse start date: "${startDateStr}"`);
        return null;
      }
      
      // Create start and end of day boundaries in UTC
      // The parsedDate is already in UTC, so we need to create the boundaries in UTC
      const utcStart = new Date(Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate(), 0, 0, 0, 0));
      const utcEnd = new Date(Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate(), 23, 59, 59, 999));
      startUTC = utcStart.getTime();
      endUTC = utcEnd.getTime();
      
      logger.debug(`📅 Single date range: ${utcStart.toISOString()} to ${utcEnd.toISOString()}`);
    }
  } else {
    // Date range
    const startDate = parseDate(startDateStr);
    const endDate = parseDate(endDateStr);
    
    if (!startDate || !endDate) {
      logger.error(`❌ Failed to parse date range: start="${startDateStr}" (${startDate}), end="${endDateStr}" (${endDate})`);
      return null;
    }
    
    // Create start of day boundary for start date in UTC
    const utcStart = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate(), 0, 0, 0, 0));
    
    let utcEnd;
    if (endDateStr.toLowerCase() === "today") {
      // For "today", use current time in America/New_York and convert to UTC
      const now = new Date();
      // Create current time in America/New_York
      const nyEnd = now;
      utcEnd = nyToUTC(nyEnd);
    } else {
      // Create end of day boundary for end date in UTC
      utcEnd = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate(), 23, 59, 59, 999));
    }
    
    startUTC = utcStart.getTime();
    endUTC = utcEnd.getTime();
    
    logger.debug(`📅 Date range: ${utcStart.toISOString()} to ${utcEnd.toISOString()}`);
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
  let allMessages = [];
  let allRaw = [];
  let beforeId = undefined;
  let hitLimit = false;
  let stopTime = null;

  while (allMessages.length < max) {
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
      allMessages.push(msg);
      kept++;
      if (allMessages.length >= max) {
        hitLimit = true;
        stopTime = new Date(ts);
        break;
      }
      beforeId = msg.id;
    }
    if (hitLimit) break;
    if (batch.size > 0 && batch.last().createdTimestamp < startUTC) break;
  }
  const sorted = allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  return { sorted, rawLog: allRaw, hitLimit, stopTime };
}

function buildOpenAIInput(sorted, userPrompt, botId) {
  // Filter out already processed messages
  const newMessages = sorted.filter(msg => !processedMessageIds.has(msg.id));
  
  // Add new message IDs to the processed set
  newMessages.forEach(msg => processedMessageIds.add(msg.id));
  
  // Log the number of new vs total messages
  logger.debug(`Processing ${newMessages.length} new messages out of ${sorted.length} total messages`);
  
  const input = newMessages.map(msg => {
    const username = msg.author?.username || msg.author?.id || "unknown";
    // Convert message timestamp from UTC to America/New_York time for display
    const utcDate = new Date(msg.createdTimestamp);
    const nyDate = utcToNY(utcDate);
    const dateStr = nyDate.toISOString().replace('T', ' ').slice(0, 16);
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
  parseDateRange,
  fetchMessages,
  fetchMessagesOptimized,
  buildOpenAIInput
};
