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

## WhatsApp Business Health (read-only)

Perintah owner `/wahealth` atau tombol `♧ WA BUSINESS HEALTH` membaca aset WhatsApp Business milik WABA yang dikonfigurasi menggunakan Meta Graph API resmi. Fitur ini tidak memindai nomor konsumen, tidak meminta atau mengirim OTP, tidak menjalankan registrasi, dan tidak mengukur cooldown login SMS/telepon.

Environment variables pada Vercel:

- `META_WABA_ID` — ID WhatsApp Business Account milik bisnis.
- `META_ACCESS_TOKEN` — token User/System User yang memiliki izin Meta yang dibutuhkan untuk membaca aset WhatsApp Business. Simpan sebagai secret; jangan masukkan ke kode atau chat.
- `META_GRAPH_API_VERSION` — opsional, default `v27.0`.
- `META_GRAPH_TIMEOUT_MS` — opsional, default 10000 ms.

Data yang ditampilkan berasal dari respons Graph API: status WABA, business verification, health status, messaging limit, nomor yang terhubung, status operasional Cloud API, status OTP pendaftaran nomor bisnis bila tersedia, status nama, quality rating, platform, dan throughput. Field yang tidak diberikan API ditampilkan sebagai tidak tersedia; tidak ditebak.

Penting: status verifikasi nomor WABA/Cloud API bukan status cooldown OTP akun WhatsApp konsumen. API resmi tidak menyediakan timer cooldown login untuk nomor sembarang. Gunakan hasil ini hanya untuk aset bisnis yang memang dikelola oleh akun Meta milikmu.
