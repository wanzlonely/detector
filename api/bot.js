const bot = require('../bot');
const { waitUntil } = require('@vercel/functions');
const { redis } = require('../database');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const [webhook, redisStatus] = await Promise.all([
        bot.telegram.getWebhookInfo(),
        redis.ping()
      ]);
      return res.status(200).json({
        ok: true,
        redis: { connected: redisStatus === 'PONG' },
        webhook: {
          configured: Boolean(webhook.url),
          pendingUpdates: webhook.pending_update_count || 0
        }
      });
    } catch (err) {
      console.error('[webhook health]', err && err.message || err);
      return res.status(502).json({
        ok: false,
        error: 'Pemeriksaan kesehatan Telegram atau Redis gagal'
      });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).send('Method Not Allowed');
  }

  const secret = process.env.WEBHOOK_SECRET;
  if (!secret || !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    return res.status(503).send('Webhook security is not configured correctly');
  }
  if (req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.status(401).send('Unauthorized');
  }

  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || !Number.isInteger(req.body.update_id)) {
    return res.status(400).send('Invalid update payload');
  }

  res.status(200).send('OK');
  waitUntil(
    bot.handleUpdate(req.body).catch((err) => {
      console.error('[webhook update failed]', err && err.stack || err);
    })
  );
};
