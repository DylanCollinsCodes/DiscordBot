const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');
const config = require('../config/botConfig');
const logger = require('../utils/logger');
const { fetchMessagesOptimized, fetchMessages } = require('../utils/messageUtils');

class IndexService {
  constructor() {
    this.enabled = config.get('persistence.enabled');
    this.logsPath = config.get('persistence.logsPath');
  }

  /**
   * Append a single message to the monthly JSONL log file.
   */
  async appendMessage(message) {
    if (!this.enabled) return;
    try {
      const channelId = message.channel.id;
      const date = new Date(message.createdTimestamp);
      const year = date.getFullYear().toString();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const dir = path.join(this.logsPath, channelId, year);
      const file = path.join(dir, `${month}.jsonl`);

      await fs.mkdir(dir, { recursive: true });
      const entry = {
        id: message.id,
        author: {
          id: message.author.id,
          username: message.author.username
        },
        content: message.content,
        createdTimestamp: message.createdTimestamp
      };
      await fs.appendFile(file, JSON.stringify(entry) + '\n');
    } catch (error) {
      logger.error('IndexService.appendMessage failed:', { error: error.message });
    }
  }

  /**
   * Read one or more monthly JSONL files and return messages in the date range.
   */
  async getMessagesByDateRange(channelId, { startUTC, endUTC }) {
    if (!this.enabled) return { sorted: [] };
    try {
      const results = [];
      const start = new Date(startUTC);
      const end = new Date(endUTC);

      let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const endCursor = new Date(end.getFullYear(), end.getMonth(), 1);
      while (cursor <= endCursor) {
        const year = cursor.getFullYear().toString();
        const month = String(cursor.getMonth() + 1).padStart(2, '0');
        const filePath = path.join(this.logsPath, channelId, year, `${month}.jsonl`);
        try {
          const stream = await fs.open(filePath, 'r');
          const rl = readline.createInterface({
            input: stream.createReadStream(),
            crlfDelay: Infinity
          });
          for await (const line of rl) {
            try {
              const obj = JSON.parse(line);
              if (obj.createdTimestamp >= startUTC && obj.createdTimestamp <= endUTC) {
                results.push(obj);
              }
            } catch {}
          }
          await stream.close();
        } catch {
          // file missing or unreadable
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }

      const sorted = results.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      return { sorted };
    } catch (error) {
      logger.error('IndexService.getMessagesByDateRange failed:', { error: error.message });
      return { sorted: [] };
    }
  }

  /**
   * Index historic messages by fetching them over the API and writing to logs.
   * Returns a summary: count, from, to, and duration in ms.
   */
  async indexHistoricMessages(channel, { startUTC, endUTC }) {
    if (!this.enabled) {
      return {
        count: 0,
        from: new Date(startUTC).toISOString(),
        to: new Date(endUTC).toISOString(),
        timeMs: 0
      };
    }
    const startTime = Date.now();
    let total = 0;

    try {
      // Fetch messages using optimized method
      const result = await fetchMessagesOptimized(channel, { startUTC, endUTC, max: Number.MAX_SAFE_INTEGER });
      const toIndex = result.rawLog || result.sorted;
      for (const msg of toIndex) {
        await this.appendMessage(msg);
        total++;
      }

      // If fallback was used or rawLog missing, fetch remaining via linear
      if (result.usedFallback || !result.rawLog) {
        const fallback = await fetchMessages(channel, { startUTC, endUTC, max: Number.MAX_SAFE_INTEGER });
        for (const msg of fallback.rawLog) {
          await this.appendMessage(msg);
          total++;
        }
      }
    } catch (error) {
      logger.error('IndexService.indexHistoricMessages failed:', { error: error.message });
    }

    const timeMs = Date.now() - startTime;
    return {
      count: total,
      from: new Date(startUTC).toISOString(),
      to: new Date(endUTC).toISOString(),
      timeMs
    };
  }
}

module.exports = IndexService;
