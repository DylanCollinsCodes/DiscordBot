const fs = require('fs');
const path = require('path');

class Logger {
  constructor(options = {}) {
    this.level = options.level || process.env.LOG_LEVEL || 'debug';
    this.enableFileLogging = options.enableFileLogging || false;
    this.logFile = options.logFile || 'bot.log';
    
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
  }

  shouldLog(level) {
    return this.levels[level] <= this.levels[this.level];
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    if (data) {
      return `${prefix} ${message} ${JSON.stringify(data, null, 2)}`;
    }
    return `${prefix} ${message}`;
  }

  log(level, message, data = null) {
    if (!this.shouldLog(level)) return;

    const formatted = this.formatMessage(level, message, data);
    
    // Console output
    if (level === 'error') {
      console.error(formatted);
    } else if (level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }

    // File logging (optional)
    if (this.enableFileLogging) {
      try {
        fs.appendFileSync(this.logFile, formatted + '\n');
      } catch (err) {
        console.error('Failed to write to log file:', err.message);
      }
    }
  }

  error(message, data = null) {
    this.log('error', message, data);
  }

  warn(message, data = null) {
    this.log('warn', message, data);
  }

  info(message, data = null) {
    this.log('info', message, data);
  }

  debug(message, data = null) {
    this.log('debug', message, data);
  }

  // Utility method for debugging objects to files
  writeDebugFile(filename, data, description = '') {
    try {
      const content = JSON.stringify(data, null, 2);
      fs.writeFileSync(filename, content);
      if (description) {
        this.debug(`Debug file written: ${filename} - ${description}`);
      }
    } catch (err) {
      this.error(`Failed to write debug file ${filename}:`, { error: err.message });
    }
  }
}

module.exports = new Logger();