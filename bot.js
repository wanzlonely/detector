require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
// TEMP - loading full content next
module.exports = require('fs').existsSync('./bot.full.js') ? require('./bot.full.js') : {};
