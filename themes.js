function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const VARIANT_PREFIX = {
  primary: '⚡ ',
  success: '✅ ',
  danger: '🛡 '
};

function btn(text, callback_data, variant = null) {
  const prefix = VARIANT_PREFIX[variant] || '';
  return { text: `${prefix}${text}`, callback_data };
}

function formatIDR(num) {
  return 'Rp ' + Number(num).toLocaleString('id-ID');
}

const THEMES = {
  obsidian: {
    id: 'obsidian',
    label: 'Obsidian Minimal',
    tagline: 'Clean monochrome & typographic precision',
    mark: '◈',
    bullet: '▪',
    divider: '──────────────────────────',
    barFill: '▰',
    barEmpty: '▱',
    usePreBlock: false
  },
  telemetry: {
    id: 'telemetry',
    label: 'Cyber Telemetry',
    tagline: 'Raw terminal HUD & monospace data grid',
    mark: '⬡',
    bullet: '▸',
    divider: '══════════════════════════',
    barFill: '█',
    barEmpty: '░',
    usePreBlock: true
  },
  editorial: {
    id: 'editorial',
    label: 'Editorial Gold',
    tagline: 'Refined spacing & executive layout',
    mark: '✦',
    bullet: '•',
    divider: '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄',
    barFill: '●',
    barEmpty: '○',
    usePreBlock: false
  },
  aurora: {
    id: 'aurora',
    label: 'Aurora Glass',
    tagline: 'Soft gradient framing & rounded card feel',
    mark: '✧',
    bullet: '◦',
    divider: '╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌',
    barFill: '◆',
    barEmpty: '◇',
    usePreBlock: false
  }
};

function getTheme(themeId) {
  return THEMES[themeId] || THEMES.obsidian;
}

function renderMeter(seconds, theme, length = 6) {
  if (!seconds || seconds <= 0) {
    return `${theme.barEmpty.repeat(length)} READY`;
  }
  const ratio = Math.min(1, Math.max(0.16, seconds / 7200));
  const filled = Math.round(ratio * length);
  const empty = Math.max(0, length - filled);
  return `${theme.barFill.repeat(filled)}${theme.barEmpty.repeat(empty)}`;
}

function formatSensitiveNumber(formattedNumber, privacyMode) {
  if (!privacyMode) return `<code>${escapeHtml(formattedNumber)}</code>`;
  const parts = formattedNumber.split(/[-\s]/);
  if (parts.length >= 3) {
    const visible = parts.slice(0, 2).join(' ');
    const hidden = parts.slice(2).join('-');
    return `<code>${escapeHtml(visible)}-</code><tg-spoiler><code>${escapeHtml(hidden)}</code></tg-spoiler>`;
  }
  return `<tg-spoiler><code>${escapeHtml(formattedNumber)}</code></tg-spoiler>`;
}

function formatDateWIB(unixSec) {
  if (!unixSec) return '-';
  return (
    new Date(unixSec * 1000).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) + ' WIB'
  );
}

function renderDashboard({ user, isVip, isOwner = false, brandName }) {
  const remaining = Math.max(0, 3 - Number(user.free_used_today || 0));
  const tier = isOwner ? 'OWNER ACCESS' : !isVip
    ? 'AKSES GRATIS'
    : String(user.vip_tier).toUpperCase() === 'ULTRA'
      ? 'PREMIUM ULTRA'
      : 'PREMIUM STANDARD';
  const quota = isOwner
    ? 'TANPA BATAS · AKSES OWNER'
    : isVip
      ? 'TANPA BATAS · MAKS. ' + (user.bulk_limit || 10) + ' NOMOR / KIRIM · AKTIF S/D ' + formatDateWIB(user.vip_until)
      : remaining + '/3 PEMERIKSAAN TERSISA · RESET 00.00 WIB';
  const identity = escapeHtml(user.full_name || 'Pengguna');
  return [
    '✧ <b>' + escapeHtml(brandName || 'META DETECT') + '</b>',
    '<i>ADVANCED WHATSAPP TELEMETRY</i>',
    '<code>━━━━━━━━━━━━━━━━━━━━━━━━</code>',
    '',
    '◈ <b>PROFIL AKUN</b>',
    '✦ Nama        <b>' + identity + '</b>',
    '⌁ ID Telegram <code>' + user.telegram_id + '</code>',
    '♛ Akses       <b>' + tier + '</b>',
    '◉ Kuota       <code>' + escapeHtml(quota) + '</code>',
    '⌗ Aktivitas   <code>' + Number(user.total_checks || 0) + ' pemeriksaan</code>',
    '',
    '⌁ <b>PANDUAN SINGKAT</b>',
    '① Tekan <b>DETECT</b> atau kirim nomor langsung.',
    '② Gunakan kode negara, contoh <code>6282298902274</code>.',
    '③ Untuk pemeriksaan massal, pisahkan nomor dengan baris baru sesuai batas akun.',
    '④ Hasil akan dikirim otomatis setelah pemeriksaan selesai.',
    '',
    '<i>◈ SISTEM AKTIF · ' + (isOwner ? 'MODE OWNER' : 'SESI PENGGUNA') + '</i>'
  ].join('\n');
}

function renderStoreCatalog({ user, activeTier, packages }) {
  const isUltra = activeTier === 'ultra';
  const title = isUltra ? '♛ PREMIUM ULTRA' : '✧ PREMIUM STANDARD';
  const subtitle = isUltra
    ? 'Performa tertinggi untuk pemeriksaan berskala besar.'
    : 'Akses premium untuk penggunaan harian yang lebih leluasa.';
  const features = isUltra
    ? [
        'Pemeriksaan tanpa batas selama masa aktif',
        'Maksimal 30 nomor dalam satu kiriman',
        'Jalur rotasi proxy prioritas',
        'Ringkasan hasil pemeriksaan massal',
        'Dirancang untuk penggunaan intensif'
      ]
    : [
        'Pemeriksaan tanpa batas selama masa aktif',
        'Maksimal 10 nomor dalam satu kiriman',
        'Rotasi proxy otomatis',
        'Akses premium Standard',
        'Cocok untuk penggunaan rutin'
      ];
  const packageLines = packages.map((pkg, index) => {
    const perDay = Math.round(pkg.price / pkg.duration_days);
    return (index + 1) + '. <b>' + escapeHtml(pkg.durationLabel) + '</b>  ·  <b>' +
      formatIDR(pkg.price) + '</b>  <i>' + escapeHtml(pkg.tag) + '</i>\n   <i>Sekitar ' +
      formatIDR(perDay) + ' per hari</i>';
  }).join('\n\n');
  return [
    title + '  /  KATALOG PAKET',
    '<i>' + subtitle + '</i>',
    '<code>━━━━━━━━━━━━━━━━━━━━━━━━</code>',
    '',
    '◈ <b>KEUNGGULAN PAKET</b>',
    ...features.map((feature) => '✦ ' + feature),
    '',
    '▤ <b>PILIH DURASI</b>',
    '<code>━━━━━━━━━━━━━━━━━━━━━━━━</code>',
    packageLines,
    '',
    '<i>Pilih salah satu paket melalui tombol di bawah.</i>'
  ].join('\n');
}

function renderPackageDetailCard({ user, pkg }) {
  const t = getTheme(user.theme);
  const isUltra = pkg.tier === 'ultra';
  const icon = isUltra ? '👑' : '⚡';
  const perDay = Math.round(pkg.price / pkg.duration_days);

  const features = isUltra
    ? [
        'Unlimited pengecekan nomor selama masa aktif',
        'Ultra Bulk Check hingga 30 nomor dalam 1 pesan',
        'Batch Analytics Summary (Ready / Cooldown / Banned)',
        'Priority DataImpulse IP Rotation (hingga 7x retry)',
        'Prioritas antrean dan dukungan operasional'
      ]
    : [
        'Unlimited pengecekan nomor selama masa aktif',
        'Standard Bulk Check hingga 10 nomor dalam 1 pesan',
        'DataImpulse Rotating IP per request (5x retry)',
        'Akses penuh semua tema UI & Privacy Spoiler',
        'Prioritas antrean di atas pengguna Free'
      ];

  return (
    `${t.mark} <b>PACKAGE SHOWCASE · ${icon} ${pkg.tierLabel}</b>\n\n` +
    `<blockquote>` +
    `${t.bullet} <b>Paket:</b> <b>${escapeHtml(pkg.durationLabel)}</b> [<code>${pkg.tag}</code>]\n` +
    `${t.bullet} <b>Kategori:</b> <code>${pkg.tierLabel}</code>\n` +
    `${t.bullet} <b>Harga Paket:</b> <b><code>${formatIDR(pkg.price)}</code></b>\n` +
    `${t.bullet} <b>Efisiensi Biaya:</b> <code>${formatIDR(perDay)} / hari</code>\n` +
    `${t.bullet} <b>Kapasitas Bulk:</b> <code>${pkg.bulk_limit} Nomor / Batch</code>` +
    `</blockquote>\n\n` +
    `<blockquote expandable>` +
    `<b>✨ KEUNTUNGAN & SPESIFIKASI LENGKAP</b>\n` +
    `${t.divider}\n` +
    features.map((f) => `${t.bullet} ${f}`).join('\n') +
    `</blockquote>\n\n` +
    `<i>${escapeHtml(pkg.highlight)}</i>`
  );
}

function renderPaymentMaintenanceCard({ user, pkg }) {
  const t = getTheme(user.theme);
  const icon = pkg.tier === 'ultra' ? '👑' : '⚡';

  return (
    `${t.mark} <b>CHECKOUT & PAYMENT GATEWAY</b>\n\n` +
    `<blockquote>` +
    `${t.bullet} <b>Paket Dipilih:</b> ${icon} <b>${escapeHtml(pkg.tierLabel)} · ${escapeHtml(pkg.durationLabel)}</b>\n` +
    `${t.bullet} <b>Total Tagihan:</b> <code>${formatIDR(pkg.price)}</code>\n` +
    `${t.bullet} <b>Status Sistem:</b> <code>🚧 DALAM PROSES PENGERJAAN</code>` +
    `</blockquote>\n\n` +
    `<blockquote expandable>` +
    `<b>🚧 INFORMASI SISTEM PEMBAYARAN</b>\n` +
    `${t.divider}\n` +
    `Modul pembayaran otomatis (QRIS & Virtual Account) sedang dalam tahap penyelesaian akhir oleh tim pengembang.\n\n` +
    `Untuk pembelian paket saat ini, silakan hubungi Admin secara langsung agar akun Anda diaktifkan secara manual.` +
    `</blockquote>`
  );
}

function renderCooldownCard({ result, user, isVip }) {
  const t = getTheme(user.theme);
  const sisaFree = Math.max(0, 3 - Number(user.free_used_today || 0));
  const numberDisplay = formatSensitiveNumber(result.formattedNumber, Boolean(user.privacy_mode));

  const ch = result.channels;
  const rows = [{ name: 'Verifikasi SMS', data: ch.sms }];

  let channelSection = '';
  if (t.usePreBlock) {
    const lines = rows.map((r) => {
      const meter = renderMeter(r.data.rawSeconds, t, 6);
      const val = String(r.data.isCooldown ? r.data.uiTimer : '0.00');
      return `${r.name} │ ${val.padEnd(5)} │ ${meter}`;
    });
    channelSection = `<pre>${lines.join('\n')}</pre>\n\n`;
  } else {
    const lines = rows.map((r) => {
      const label = r.name.trim();
      const status = r.data.isCooldown
        ? `<code>${r.data.uiTimer}</code> (${r.data.humanTime})`
        : `<code>0.00 · READY</code>`;
      const meter = renderMeter(r.data.rawSeconds, t, 6);
      return `${t.bullet} <b>${label}:</b> ${status}\n   <code>${meter}</code>`;
    });
    channelSection =
      `<blockquote expandable>` +
      `<b>📡 STATUS VERIFIKASI SMS (TAP TO EXPAND)</b>\n` +
      `${t.divider}\n` +
      lines.join('\n') +
      `</blockquote>\n\n`;
  }

  const verdict = result.isBanned
    ? 'RESTRICTED — Nomor terblokir dari layanan WhatsApp.'
    : result.anyCooldown
      ? 'COOLDOWN ACTIVE — Verifikasi SMS masih dalam masa tunggu.'
      : 'ALL CLEAR — Verifikasi SMS siap diproses.';

  const tierFooter = String(user.vip_tier).toUpperCase() === 'OWNER'
    ? '✧ OWNER UNLIMITED'
    : !isVip
      ? `QUOTA ${sisaFree}/3`
      : String(user.vip_tier).toUpperCase() === 'ULTRA'
        ? '♛ ULTRA UNLIMITED'
        : '✧ STANDARD UNLIMITED';

  return (
    `${t.mark} <b>TELEMETRY REPORT</b>\n\n` +
    `<blockquote>` +
    `${t.bullet} <b>Target:</b> ${numberDisplay} [<code>${result.region}</code>]\n` +
    `${t.bullet} <b>State:</b> <code>${result.accountStatus}</code>\n` +
    `${t.bullet} <b>Proxy Route:</b> <code>${escapeHtml(result.proxyInfo)}</code>\n` +
    `${t.bullet} <b>Verdict:</b> <i>${verdict}</i>` +
    `</blockquote>\n\n` +
    channelSection +
    `<i>${formatDateWIB(Math.floor(Date.now() / 1000))} · ${tierFooter}</i>`
  );
}

module.exports = {
  THEMES,
  getTheme,
  escapeHtml,
  btn,
  formatIDR,
  formatDateWIB,
  renderDashboard,
  renderStoreCatalog,
  renderPackageDetailCard,
  renderPaymentMaintenanceCard,
  renderCooldownCard
};
