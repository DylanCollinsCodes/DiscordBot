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
            return message.reply('Usage: !ctx get <username>');
          }
          const username = args[0];
          const userCtx = await this.contextService.getUser(username);
          logger.debug('Retrieving user context', { username, count: Object.keys(userCtx).length });
          return message.reply('Context for user ' + username + ':\n```' + JSON.stringify(userCtx, null, 2) + '```');
        }
        case 'adduser': {
          if (args.length < 3) {
            return message.reply('Usage: !ctx adduser <@user> <key> <value>');
          }
          const mention = message.mentions.users.first();
          if (!mention) {
            return message.reply('You must mention a user.');
          }
          const username = mention.username;
          const key = args[1];
          const value = args.slice(2).join(' ');
          await this.contextService.addUser(username, key, value);
          logger.info('User context added', { username, key });
          return message.reply(`Context for user ${username} set to: ${value}`);
        }
        case 'deluser': {
          if (args.length < 2) {
            return message.reply('Usage: !ctx deluser <username> <key>');
          }
          const username = args[0];
          const key = args[1];
          await this.contextService.deleteUser(username, key);
          logger.info('User context deleted', { username, key });
          return message.reply(`Context deleted for user ${username}: ${key}`);
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
