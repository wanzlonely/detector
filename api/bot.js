const bot = require('../bot');
const { waitUntil } = require('@vercel/functions');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const [webhook, identity] = await Promise.all([
        bot.telegram.getWebhookInfo(),
        bot.telegram.getMe()
      ]);
      return res.status(200).json({
        ok: true,
        bot: { id: identity.id, username: identity.username },
        webhook: {
          configured: Boolean(webhook.url),
          url: webhook.url || null,
          pendingUpdates: webhook.pending_update_count || 0,
          lastErrorDate: webhook.last_error_date || null,
          lastErrorMessage: webhook.last_error_message || null,
          maxConnections: webhook.max_connections || null
        }
      });
    } catch (err) {
      console.error('[webhook health]', err && err.message || err);
      return res.status(502).json({
        ok: false,
        error: 'Tidak dapat menghubungi Telegram Bot API',
        detail: err && err.message ? err.message : 'Unknown Telegram API error'
      });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).send('Method Not Allowed');
  }

  const secret = process.env.WEBHOOK_SECRET;
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.status(401).send('Unauthorized');
  }

  res.status(200).send('OK');
  waitUntil(
    bot.handleUpdate(req.body).catch((err) => {
      console.error('[webhook update failed]', err && err.stack || err);
    })
  );
};
