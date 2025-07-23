function parseDateRange(content) {
  const dateRangeMatch = content.match(/\{\s*([0-9/]+|Today)(?:\s*-\s*([0-9/]+|Today))?\s*\}/i);
  if (!dateRangeMatch) return null;
  const startDateStr = dateRangeMatch[1];
  let endDateStr = dateRangeMatch[2];
  let startUTC, endUTC;
  if (!endDateStr) {
    // Single date or { Today }
    if (startDateStr.toLowerCase() === "today") {
      const now = new Date();
      const localStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const localEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      startUTC = localStart.getTime();
      endUTC = localEnd.getTime();
    } else {
      const local = new Date(startDateStr);
      if (isNaN(local)) return null;
      const localStart = new Date(local.getFullYear(), local.getMonth(), local.getDate(), 0, 0, 0, 0);
      const localEnd = new Date(local.getFullYear(), local.getMonth(), local.getDate(), 23, 59, 59, 999);
      startUTC = localStart.getTime();
      endUTC = localEnd.getTime();
    }
  } else {
    let right;
    if (endDateStr.toLowerCase() === "today") {
      const now = new Date();
      right = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else {
      right = new Date(endDateStr);
    }
    const left = new Date(startDateStr);
    if (isNaN(left) || isNaN(right)) return null;
    const leftStart = new Date(left.getFullYear(), left.getMonth(), left.getDate(), 0, 0, 0, 0);
    let rightEnd;
    if (endDateStr.toLowerCase() === "today") {
      rightEnd = right;
    } else {
      rightEnd = new Date(right.getFullYear(), right.getMonth(), right.getDate(), 23, 59, 59, 999);
    }
    startUTC = leftStart.getTime();
    endUTC = rightEnd.getTime();
  }
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
  parseDateRange,
  fetchMessages,
  buildOpenAIInput
};
