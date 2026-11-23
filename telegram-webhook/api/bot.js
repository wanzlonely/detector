const crypto = require('node:crypto');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

function validSecret(value) {
  if (typeof value !== 'string' || !WEBHOOK_SECRET) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(WEBHOOK_SECRET);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function sendTelegramMessage(chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) throw new Error(`Telegram API returned ${response.status}`);
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'telegram-webhook',
      configured: Boolean(BOT_TOKEN && WEBHOOK_SECRET)
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).send('Method Not Allowed');
  }

  if (!BOT_TOKEN || !WEBHOOK_SECRET || !/^[A-Za-z0-9_-]{1,256}$/.test(WEBHOOK_SECRET)) {
    return res.status(503).send('Webhook configuration is incomplete');
  }

  if (!validSecret(req.headers['x-telegram-bot-api-secret-token'])) {
    return res.status(401).send('Unauthorized');
  }

  const update = req.body;
  if (!update || typeof update !== 'object' || Array.isArray(update) || !Number.isInteger(update.update_id)) {
    return res.status(400).send('Invalid update');
  }

  const message = update.message;
  const chatId = message && message.chat && message.chat.id;
  const text = typeof message?.text === 'string' ? message.text.trim() : '';

  if (chatId && (text === '/start' || text.startsWith('/start '))) {
    try {
      await sendTelegramMessage(chatId, 'Bot Telegram sudah terhubung. Endpoint webhook aktif.');
    } catch (error) {
      console.error('[telegram-webhook] sendMessage failed:', error.message);
      return res.status(502).send('Telegram API request failed');
    }
  } else if (chatId && text === '/help') {
    try {
      await sendTelegramMessage(chatId, 'Layanan webhook dasar aktif. Fitur lain belum dipasang pada layanan terisolasi ini.');
    } catch (error) {
      console.error('[telegram-webhook] sendMessage failed:', error.message);
      return res.status(502).send('Telegram API request failed');
    }
  }

  return res.status(200).send('OK');
};
