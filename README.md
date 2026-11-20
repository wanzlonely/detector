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
- `DATAIMPULSE_LOGIN` / `DATAIMPULSE_PASSWORD` (disarankan untuk rotasi proxy)
- `WA_CHECK_TIMEOUT_MS` (opsional, default 8000)
- `CHECK_CACHE_TTL_SECONDS` (opsional, default 600)

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

Menu akun, status, leaderboard, referral, katalog premium, aktivasi owner, broadcast, dan kontak admin tersedia.

**Fitur deteksi nomor WhatsApp sudah aktif kembali** dengan peningkatan akurasi:

- Dual probe (`/v2/exist` + `/v2/code` method=`wa_old`) — tidak memicu OTP asli
- Deteksi akurat: **Siap verifikasi**, **Cooldown multi-channel** (SMS / Voice / Flash / Perangkat lain), **Tidak support clone**, **Banned**, **Security block**
- Label timer cocok dengan UI WhatsApp (`Coba lagi dalam X.XX`)
- Cache hasil, kuota free/VIP, bulk check (max 30 untuk premium), progress & cancel
- Proxy rotation (DataImpulse) + fallback langsung
