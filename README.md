# Detector — Telegram Bot

Telegram bot berbasis Telegraf dengan penyimpanan Upstash Redis.

## Runtime

- Node.js 24.x (dipin untuk konsistensi runtime Vercel).
- Vercel Function: `api/bot.js`.
- Telegram webhook harus memakai HTTPS dan `WEBHOOK_SECRET`.
- Upstash Redis diperlukan untuk profil pengguna, status premium, referral, dan statistik.

## Environment variables

Atur variabel berikut pada Vercel untuk Production, Preview, dan Development sesuai kebutuhan:

- `BOT_TOKEN`
- `ADMIN_ID`
- `BRAND_NAME`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `WEBHOOK_SECRET` (wajib; 1–256 karakter, hanya huruf, angka, underscore, dan hyphen)

## Menjalankan pemeriksaan

```bash
npm install
npm run check
```

## Memasang webhook

```bash
node scripts/set-webhook.js https://nama-project.vercel.app
```

Endpoint `GET /api/bot` menampilkan kesehatan Telegram, konfigurasi webhook, dan koneksi Redis. Endpoint `POST /api/bot` menerima update Telegram hanya jika secret token cocok.

## Status fitur

Menu akun, status, leaderboard, referral, katalog premium, aktivasi owner, broadcast, dan kontak admin tetap tersedia. Fitur deteksi eksternal dinonaktifkan selama pemulihan dan tidak menjalankan pemindaian kelayakan OTP.
