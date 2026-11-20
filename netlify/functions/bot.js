const ENV_KEYS = [
  'BOT_TOKEN',
  'ADMIN_ID',
  'BRAND_NAME',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'WEBHOOK_SECRET',
  'CHECK_CACHE_TTL_SECONDS',
  'DATAIMPULSE_HOST',
  'DATAIMPULSE_PORT',
  'DATAIMPULSE_LOGIN',
  'DATAIMPULSE_PASSWORD',
  'PROXY_MAX_RETRIES',
  'WA_CHECK_TIMEOUT_MS',
  'DETECTION_ENABLED'
];

for (const key of ENV_KEYS) {
  if (!process.env[key]) {
    const value = Netlify.env.get(key);
    if (value) process.env[key] = value;
  }
}

let botInstance;
function getBot() {
  if (!process.env.BOT_TOKEN) throw new Error('BOT_TOKEN belum dikonfigurasi');
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error('Kredensial Upstash Redis belum dikonfigurasi');
  }
  if (!botInstance) botInstance = require('../../bot');
  return botInstance;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'GET') {
    try {
      const bot = getBot();
      const { redis } = require('../../database');
      const [webhook, redisStatus] = await Promise.all([
        bot.telegram.getWebhookInfo(),
        redis.ping()
      ]);
      return json({
        ok: true,
        platform: 'netlify',
        redis: { connected: redisStatus === 'PONG' },
        webhook: {
          configured: Boolean(webhook.url),
          pendingUpdates: webhook.pending_update_count || 0
        }
      });
    } catch (err) {
      console.error('[health]', err && err.message || err);
      return json({ ok: false, error: 'Pemeriksaan bot atau Redis gagal' }, 502);
    }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { Allow: 'GET, POST' },
      body: 'Method Not Allowed'
    };
  }

  const secret = process.env.WEBHOOK_SECRET || Netlify.env.get('WEBHOOK_SECRET');
  if (!secret || !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    return { statusCode: 503, body: 'Webhook security is not configured correctly' };
  }
  if (event.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  let update;
  try {
    update = JSON.parse(event.body || '{}');
  } catch (_) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }
  if (!update || Array.isArray(update) || !Number.isInteger(update.update_id)) {
    return { statusCode: 400, body: 'Invalid update payload' };
  }

  try {
    const bot = getBot();
    await bot.handleUpdate(update);
    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('[webhook handler]', err && err.message || err);
    return { statusCode: 503, body: 'Webhook handler unavailable' };
  }
};
