require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const VERCEL_URL = process.argv[2];
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN tidak ditemukan di .env');
  process.exit(1);
}

if (!VERCEL_URL) {
  console.error('Pakai: node scripts/set-webhook.js https://nama-project-kamu.vercel.app');
  process.exit(1);
}

const webhookUrl = `${VERCEL_URL.replace(/\/$/, '')}/api/bot`;

async function main() {
  const body = { url: webhookUrl };
  if (WEBHOOK_SECRET) body.secret_token = WEBHOOK_SECRET;

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  console.log('setWebhook result:', data);

  const info = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
  console.log('getWebhookInfo:', await info.json());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
