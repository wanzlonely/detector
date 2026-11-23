# Nexus WA Telemetry Bot

Telegram bot built with Telegraf, Node.js 24, Vercel Functions, and Upstash Redis.

## Current supported behavior

- Telegram start screen, account status, leaderboard, referral information, and redemption of previously earned referral balances.
- Premium package catalog and owner-managed Premium activation.
- User-to-admin contact flow, owner replies, and broadcast.
- `/detect` accepts phone-number input for **format validation only**: international normalization, invalid-entry reporting, and duplicate removal.
- Free users can validate one number per message. Premium users and the owner can validate up to 30 numbers per message.

The current DETECT flow does not query WhatsApp account status, inspect SMS/voice cooldowns, or claim that a number is ready. It does not send verification codes and does not consume detection quota. Email/OTP triggering is disabled.

Legacy live-probing and proxy-rotation modules are retired and replaced with disabled interfaces. They are not part of the bot runtime.

## Runtime and deployment

- Node.js 24.x.
- Vercel Function entry point: `api/bot.js`.
- Telegram webhook endpoint: `/api/bot`.
- Upstash Redis is required for user profiles, Premium status, referral data, and statistics.

Set these environment variables in Vercel for the environments you use:

- `BOT_TOKEN`
- `ADMIN_ID`
- `BRAND_NAME`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `WEBHOOK_SECRET` — required; 1–256 characters containing only letters, digits, underscores, or hyphens.

Do not commit real tokens, passwords, or Redis credentials.

## Local checks

```bash
npm install
npm run check
```

The check command validates JavaScript syntax, phone-input parsing, and the disabled state of retired network modules.

## Local polling mode

Create a local `.env` from `.env.example`, set the required environment variables, then run:

```bash
npm start
```

Do not run polling mode at the same time as a production webhook for the same bot token.

## Configure the Telegram webhook

After deploying to Vercel, run:

```bash
node scripts/set-webhook.js https://your-project.vercel.app
```

The script configures Telegram's webhook secret token using `WEBHOOK_SECRET`.

## Health endpoint

- `GET /api/bot` checks Telegram webhook metadata and the Redis connection.
- `POST /api/bot` accepts Telegram updates only when the `X-Telegram-Bot-Api-Secret-Token` header matches `WEBHOOK_SECRET`.

The health response intentionally omits the webhook URL and other sensitive configuration.

## Payment status

The package catalog is available, but automatic payment processing is not configured. Premium activation remains owner-managed until a verified payment integration is implemented.
