# Isolated Telegram Webhook

This directory is a minimal, isolated Telegram webhook service for Vercel. It does not import the main detector bot, WhatsApp registration-checking modules, proxy modules, or Redis database.

## Vercel configuration

Set these environment variables in the target Vercel project for Production:

- `BOT_TOKEN`: Telegram bot token.
- `WEBHOOK_SECRET`: random 1–256 character string containing only letters, digits, underscores, or hyphens.

Deploy with this directory as the Vercel project's Root Directory.

## Endpoints

- `GET /api/bot`: configuration health response (does not reveal secret values).
- `POST /api/bot`: accepts Telegram updates only when Telegram's secret-token header matches.

The isolated handler responds only to `/start` and `/help`. It is a migration-safe webhook shell, not a migration of the original detector bot's commands or stored data.

## Configure Telegram

After setting the environment variables and deploying, run:

```sh
BOT_TOKEN="$BOT_TOKEN" WEBHOOK_SECRET="$WEBHOOK_SECRET" node scripts/set-webhook.js https://YOUR-PROJECT.vercel.app
```

Use a strong random secret. Never commit real tokens or secrets.
