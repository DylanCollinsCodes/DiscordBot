const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config/botConfig');

class ContextService {
  constructor() {
    this.enabled = config.get('persistence.enabled');
    this.storageDir = path.resolve(process.cwd(), config.get('persistence.contextPath'));
    this.storageFile = path.join(this.storageDir, 'context.json');
    if (!this.enabled) {
      logger.info('Context persistence disabled via configuration');
      return;
    }
    this._initializeStorage().catch(error => {
      logger.error('Failed to initialize context storage', { error: error.message });
      throw error;
    });
  }

  async _initializeStorage() {
    await fs.mkdir(this.storageDir, { recursive: true });
    try {
      await fs.access(this.storageFile);
    } catch {
      const defaultData = { global: {}, users: {} };
      await fs.writeFile(this.storageFile, JSON.stringify(defaultData, null, 2), 'utf8');
      logger.debug('Context storage file created', { file: this.storageFile });
    }
  }

  async _load() {
    const raw = await fs.readFile(this.storageFile, 'utf8');
    return JSON.parse(raw);
  }

  async _save(data) {
    await fs.writeFile(this.storageFile, JSON.stringify(data, null, 2), 'utf8');
  }

  // Global context methods
  async addGlobal(key, value) {
    if (!this.enabled) return;
    logger.debug('Adding global context', { key, value });
    const data = await this._load();
    data.global[key] = value;
    await this._save(data);
    logger.info('Global context added', { key });
  }

  async getGlobal() {
    if (!this.enabled) return {};
    const data = await this._load();
    return data.global || {};
  }

  async deleteGlobal(key) {
    if (!this.enabled) return;
    logger.debug('Deleting global context', { key });
    const data = await this._load();
    delete data.global[key];
    await this._save(data);
    logger.info('Global context deleted', { key });
  }

  // User-specific context methods
  async addUser(username, key, value) {
    if (!this.enabled) return;
    logger.debug('Adding context for user', { username, key, value });
    const data = await this._load();
    data.users = data.users || {};
    data.users[username] = data.users[username] || {};
    data.users[username][key] = value;
    await this._save(data);
    logger.info('User context added', { username, key });
  }

  async getUser(username) {
    if (!this.enabled) return {};
    const data = await this._load();
    return (data.users && data.users[username]) || {};
  }

  async deleteUser(username, key) {
    if (!this.enabled) return;
    logger.debug('Deleting context for user', { username, key });
    const data = await this._load();
    if (data.users && data.users[username] && data.users[username][key]) {
      delete data.users[username][key];
      if (Object.keys(data.users[username]).length === 0) {
        delete data.users[username];
      }
      await this._save(data);
      logger.info('User context deleted', { username, key });
    }
  }

    async getCombinedContext(usernames = []) {
      if (!this.enabled) return [];
      logger.debug('Building combined context', { usernames });
      const data = await this._load();
      if (usernames.length === 0) {
        usernames = Object.keys(data.users || {});
        logger.debug('Including all stored usernames since none were tagged', { usernames });
      }
    const combined = [];
    Object.entries(data.global || {}).forEach(([key, value]) => {
      combined.push({ type: 'global', key, value });
    });
    usernames.forEach(username => {
      const userCtx = data.users && data.users[username];
      if (userCtx) {
        Object.entries(userCtx).forEach(([key, value]) => {
          combined.push({ type: 'user', username, key, value });
        });
      }
    });
    return combined;
  }
}

module.exports = new ContextService();
