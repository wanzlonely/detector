require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = Number(process.env.ADMIN_ID || 0);
const BRAND_NAME = process.env.BRAND_NAME || 'META DETECT';

const BTN_DETECT = '⌖ DETECT';
const BTN_STORE = '✧ BELI PREMIUM';
const BTN_STATUS = '◈ STATUS';
const BTN_LEADERBOARD = '♛ LEADERBOARD';
const BTN_REFERRAL = '♧ REFERRAL';
const BTN_CONTACT = '⬡ HUBUNGI ADMIN';

const USER_KEYBOARD = Markup.keyboard([
  [{ text: BTN_DETECT }, { text: BTN_STORE }],
  [{ text: BTN_STATUS }, { text: BTN_LEADERBOARD }],
  [{ text: BTN_REFERRAL }, { text: BTN_CONTACT }]
]).resize().persistent().placeholder('Pilih menu…');

bot.start(async (ctx) => {
  await ctx.reply(
    '✦ <b>ᴍᴇᴛᴀ ᴅᴇᴛᴇᴄᴛ</b> ✦\n' +
    '<i>ᴀᴅᴠᴀɴᴄᴇᴅ ᴡʜᴀᴛsᴀᴘᴘ ᴛᴇʟᴇᴍᴇᴛʀʏ</i>\n\n' +
    'Bot sudah aktif kembali.\n' +
    'Pilih menu di bawah untuk mulai.',
    { parse_mode: 'HTML', ...USER_KEYBOARD }
  );
});

bot.hears(BTN_DETECT, async (ctx) => {
  await ctx.reply('⌖ Kirim nomor yang ingin dicek (bisa banyak, max 30 untuk premium).');
});

bot.hears(BTN_STATUS, async (ctx) => {
  await ctx.reply('◈ Status akun: Free / Premium (sedang dipulihkan)');
});

bot.hears(BTN_STORE, async (ctx) => {
  await ctx.reply('✧ Fitur premium sedang dipulihkan. Hubungi admin.');
});

bot.hears(BTN_LEADERBOARD, async (ctx) => {
  await ctx.reply('♛ Leaderboard sedang dipulihkan.');
});

bot.hears(BTN_REFERRAL, async (ctx) => {
  await ctx.reply('♧ Referral sedang dipulihkan.');
});

bot.hears(BTN_CONTACT, async (ctx) => {
  await ctx.reply('⬡ Hubungi admin untuk bantuan.');
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text || '';
  if (text.startsWith('/')) return;
  if (text.includes('+') || /\d{8,}/.test(text)) {
    await ctx.reply('◈ Fitur deteksi sedang dipulihkan. Tunggu sebentar.');
  }
});

bot.catch((err) => console.error('[bot error]', err));

module.exports = bot;
