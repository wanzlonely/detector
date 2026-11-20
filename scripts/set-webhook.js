require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const VERCEL_URL = process.argv[2];
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN tidak ditemukan di .env');
  process.exit(1);
}

if (!WEBHOOK_SECRET) {
  console.error('WEBHOOK_SECRET wajib diatur di environment sebelum memasang webhook.');
  process.exit(1);
}

if (!/^[A-Za-z0-9_-]{1,256}$/.test(WEBHOOK_SECRET)) {
  console.error('WEBHOOK_SECRET harus 1-256 karakter: huruf, angka, underscore, atau hyphen.');
  process.exit(1);
}

if (!VERCEL_URL || !/^https:\/\//i.test(VERCEL_URL)) {
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
  if (!res.ok || !data.ok) throw new Error('setWebhook gagal: ' + (data.description || res.status));
  console.log('setWebhook result:', data);

  const info = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
  const infoData = await info.json();
  if (!info.ok || !infoData.ok) throw new Error('getWebhookInfo gagal: ' + (infoData.description || info.status));
  console.log('getWebhookInfo:', infoData);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
