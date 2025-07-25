const BaseHandler = require('./BaseHandler');
const ContextService = require('../services/ContextService');
const logger = require('../utils/logger');

class ContextHandler extends BaseHandler {
  constructor(client) {
    super(client);
    this.contextService = ContextService;
    this.prefix = '!ctx';
    this.alias = '!context';
  }

  shouldHandle(message) {
    const content = message.content.trim();
    const isCommand = content.startsWith(this.prefix) || content.startsWith(this.alias);
    logger.debug('ContextHandler shouldHandle check', {
      messageId: message.id,
      content,
      isCommand
    });
    return isCommand && !message.author.bot;
  }

  async handle(message) {
    const [ , command, ...args] = message.content.trim().split(/\s+/);
    try {
      switch (command) {
        case 'add': {
          if (args.length < 2) {
            return message.reply('Usage: !ctx add <key> <value>');
          }
          const key = args[0];
          const value = args.slice(1).join(' ');
          await this.contextService.addGlobal(key, value);
          logger.info('Global context added', { key });
          return message.reply(`Global context added: ${key}`);
        }
        case 'delete': {
          if (args.length < 1) {
            return message.reply('Usage: !ctx delete <key>');
          }
          const key = args[0];
          await this.contextService.deleteGlobal(key);
          logger.info('Global context deleted', { key });
          return message.reply(`Global context deleted: ${key}`);
        }
        case 'list': {
          const globalCtx = await this.contextService.getGlobal();
          logger.debug('Listing global context', { count: Object.keys(globalCtx).length });
          return message.reply('Global context: ```' + JSON.stringify(globalCtx, null, 2) + '```');
        }
        case 'get': {
          if (args.length < 1) {
            return message.reply('Usage: !ctx get <userId>');
          }
          let userId;
          const mention = message.mentions.users.first();
          if (mention) {
            userId = mention.id;
          } else {
            const raw = args[0];
            userId = raw.match(/^<@!?(\d+)>$/)?.[1] || raw;
          }
          const userCtx = await this.contextService.getUser(userId);
          logger.debug('Retrieving user context', { userId, count: Object.keys(userCtx).length });
          return message.reply('Context for user ' + userId + ':\n```' + JSON.stringify(userCtx, null, 2) + '```');
        }
        case 'adduser': {
          if (args.length < 3) {
            return message.reply('Usage: !ctx adduser <userId> <key> <value>');
          }
          let userId;
          const mention = message.mentions.users.first();
          if (mention) {
            userId = mention.id;
          } else {
            const raw = args[0];
            userId = raw.match(/^<@!?(\d+)>$/)?.[1] || raw;
          }
          const key = args[1];
          const value = args.slice(2).join(' ');
          await this.contextService.addUser(userId, key, value);
          logger.info('User context added', { userId, key });
          return message.reply(`Context for user <@${userId}> set to: ${value}`);
        }
        case 'deluser': {
          if (args.length < 2) {
            return message.reply('Usage: !ctx deluser <userId> <key>');
          }
          let userId;
          const mention = message.mentions.users.first();
          if (mention) {
            userId = mention.id;
          } else {
            const raw = args[0];
            userId = raw.match(/^<@!?(\d+)>$/)?.[1] || raw;
          }
          const key = args[1];
          await this.contextService.deleteUser(userId, key);
          logger.info('User context deleted', { userId, key });
          return message.reply(`Context deleted for user ${userId}: ${key}`);
        }
        default:
          return message.reply(
            'Unknown context command. Available: add, delete, list, get, adduser, deluser'
          );
      }
    } catch (error) {
      logger.error('Error in ContextHandler.handle:', { error: error.message });
      await this.handleError(message, error);
    }
  }
}

module.exports = ContextHandler;
