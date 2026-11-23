const baseUrl = process.argv[2];
const token = process.env.BOT_TOKEN;
const secret = process.env.WEBHOOK_SECRET;

if (!baseUrl || !token || !secret) {
  console.error('Usage: BOT_TOKEN=... WEBHOOK_SECRET=... node scripts/set-webhook.js https://your-project.vercel.app');
  process.exit(1);
}

if (!/^https:\/\//.test(baseUrl) || !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
  console.error('Invalid HTTPS URL or webhook secret format.');
  process.exit(1);
}

(async () => {
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: baseUrl.replace(/\/$/, '') + '/api/bot',
      secret_token: secret,
      allowed_updates: ['message']
    }),
    signal: AbortSignal.timeout(10000)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    console.error('Telegram setWebhook failed:', result.description || response.status);
    process.exit(1);
  }
  console.log('Telegram webhook configured:', result.result.url);
})().catch((error) => {
  console.error('Telegram setWebhook failed:', error.message);
  process.exit(1);
});
