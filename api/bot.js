const bot = require('../bot');
const { waitUntil } = require('@vercel/functions');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(200).send('Bot webhook aktif');
    return;
  }

  const secret = process.env.WEBHOOK_SECRET;
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    res.status(401).send('Unauthorized');
    return;
  }

  // Akui webhook segera agar Telegram tidak mengulang update ketika proses detect berjalan lama.
  res.status(200).send('OK');
  waitUntil(
    bot.handleUpdate(req.body).catch((err) => {
      console.error('[webhook update failed]', err && err.stack || err);
    })
  );
};
