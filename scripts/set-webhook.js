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

let deploymentOrigin = null;
try {
  const parsedUrl = new URL(VERCEL_URL);
  if (
    parsedUrl.protocol !== 'https:' ||
    !parsedUrl.hostname ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.pathname !== '/' ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error('URL harus berupa origin HTTPS tanpa path, query, atau credential.');
  }
  deploymentOrigin = parsedUrl.origin;
} catch (err) {
  console.error('Pakai: node scripts/set-webhook.js https://nama-project-kamu.vercel.app');
  console.error(err.message);
  process.exit(1);
}

const webhookUrl = new URL('/api/bot', deploymentOrigin).toString();
const telegramApi = 'https://api.telegram.org/bot' + BOT_TOKEN + '/';

const commands = [
  { command: 'start', description: 'Buka menu utama' },
  { command: 'detect', description: 'Validasi format nomor' },
  { command: 'status', description: 'Lihat status akun' },
  { command: 'referral', description: 'Lihat referral' },
  { command: 'store', description: 'Lihat paket Premium' },
  { command: 'help', description: 'Panduan penggunaan bot' },
  { command: 'cancel', description: 'Batalkan proses input' }
];

async function callTelegram(method, payload) {
  const response = await fetch(telegramApi + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(method + ' gagal: ' + (data.description || response.status));
  }
  return data;
}

async function main() {
  await callTelegram('setWebhook', {
    url: webhookUrl,
    secret_token: WEBHOOK_SECRET
  });
  console.log('Webhook berhasil dikonfigurasi.');

  await callTelegram('setMyCommands', { commands });
  console.log('Menu command Telegram diperbarui:', commands.length, 'command.');

  const info = await callTelegram('getWebhookInfo', {});
  console.log('getWebhookInfo:', {
    configured: Boolean(info.result && info.result.url),
    pendingUpdates: Number((info.result && info.result.pending_update_count) || 0)
  });
}

main().catch((err) => {
  console.error('[set-webhook]', err && err.message || err);
  process.exit(1);
});
