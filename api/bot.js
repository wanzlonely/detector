const bot = require('../bot');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(200).send('Bot webhook is alive');
    return;
  }

  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (headerSecret !== secret) {
      res.status(401).send('Unauthorized');
      return;
    }
  }

  try {
    await bot.handleUpdate(req.body, res);
  } catch (err) {
    console.error('Webhook handling error:', err);
  }

  if (!res.headersSent) {
    res.status(200).send('OK');
  }
};
