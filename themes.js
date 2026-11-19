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
  const t = getTheme(user.theme);
  const remaining = Math.max(0, 3 - Number(user.free_used_today || 0));
  const tier = isOwner ? 'OWNER ACCESS' : !isVip
    ? 'FREE ACCESS'
    : String(user.vip_tier).toUpperCase() === 'ULTRA'
      ? 'PREMIUM ULTRA'
      : 'PREMIUM STANDARD';
  const quota = isOwner
    ? 'UNLIMITED · OWNER PRIVILEGES'
    : isVip
      ? `UNLIMITED · BULK ${user.bulk_limit || 10}/BATCH · EXP ${formatDateWIB(user.vip_until)}`
      : `${remaining}/3 CHECKS LEFT · RESET 00:00 WIB`;
  const identity = escapeHtml(user.full_name || 'User');
  const header =
    `✧ <b>${escapeHtml(brandName || 'META DETECT')}</b>\n` +
    `<i>ADVANCED WHATSAPP TELEMETRY</i>\n` +
    `<code>━━━━━━━━━━━━━━━━━━━━━━━━</code>\n\n`;
  const account =
    `<blockquote>◈ <b>ACCOUNT OVERVIEW</b>\n` +
    `◦ Identity  <b>${identity}</b>\n` +
    `◦ Telegram  <code>${user.telegram_id}</code>\n` +
    `◦ Access    <b>${tier}</b>\n` +
    `◦ Quota     <code>${quota}</code>\n` +
    `◦ Total     <code>${Number(user.total_checks || 0)} checks</code></blockquote>\n\n`;
  const guide =
    `<blockquote>⌁ <b>QUICK TELEMETRY GUIDE</b>\n` +
    `1. Tekan <b>Detect</b> atau kirim nomor langsung.\n` +
    `2. Gunakan format internasional, contoh <code>6282298902274</code>.\n` +
    `3. Untuk bulk, pisahkan setiap nomor dengan baris baru sesuai limit akun.\n` +
    `4. Hasil pemeriksaan ditampilkan otomatis setelah proses selesai.</blockquote>\n\n`;
  const footer = `<i>◈ SECURE SESSION · ${isOwner ? 'OWNER MODE' : 'TELEMETRY READY'}</i>`;
  return header + account + guide + footer;
}

function renderStoreCatalog({ user, activeTier, packages }) {
  const t = getTheme(user.theme);
  const isUltra = activeTier === 'ultra';

  const tierTitle = isUltra ? '👑 PREMIUM ULTRA CATALOG' : '⚡ PREMIUM STANDARD CATALOG';
  const tierSubtitle = isUltra
    ? 'Kasta tertinggi dengan kapasitas Bulk 30 nomor, rotasi IP prioritas & Batch Analytics.'
    : 'Akses unlimited harian, kecepatan penuh & Bulk Check hingga 10 nomor sekaligus.';

  const specBlock = isUltra
    ? `<blockquote>` +
      `${t.bullet} <b>Daily Limit:</b> <code>UNLIMITED CHECKS</code>\n` +
      `${t.bullet} <b>Bulk Capacity:</b> <code>30 Nomor / Kirim</code>\n` +
      `${t.bullet} <b>IP Rotation:</b> <code>Priority 7x Auto-Rotate</code>\n` +
      `${t.bullet} <b>Extra Perks:</b> <code>Batch Summary Report + Crown Badge</code>` +
      `</blockquote>\n\n`
    : `<blockquote>` +
      `${t.bullet} <b>Daily Limit:</b> <code>UNLIMITED CHECKS</code>\n` +
      `${t.bullet} <b>Bulk Capacity:</b> <code>10 Nomor / Kirim</code>\n` +
      `${t.bullet} <b>IP Rotation:</b> <code>DataImpulse 5x Auto-Rotate</code>\n` +
      `${t.bullet} <b>Extra Perks:</b> <code>Full Theme Studio + Privacy Blur</code>` +
      `</blockquote>\n\n`;

  const listItems = packages
    .map((pkg) => {
      const perDay = Math.round(pkg.price / pkg.duration_days);
      return (
        `${t.bullet} <b>${escapeHtml(pkg.durationLabel)}</b> — <code>${formatIDR(pkg.price)}</code> [<code>${pkg.tag}</code>]\n` +
        `   <i>Hanya ${formatIDR(perDay)}/hari · ${escapeHtml(pkg.highlight)}</i>`
      );
    })
    .join('\n\n');

  return (
    `${t.mark} <b>${tierTitle}</b>\n` +
    `<i>${tierSubtitle}</i>\n\n` +
    specBlock +
    `<blockquote expandable>` +
    `<b>📦 DAFTAR PAKET ${isUltra ? 'ULTRA' : 'STANDARD'} (TAP TO EXPAND)</b>\n` +
    `${t.divider}\n` +
    listItems +
    `</blockquote>\n\n` +
    `<i>Pilih salah satu durasi paket di bawah untuk melihat kartu rincian & aktivasi:</i>`
  );
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
        'Akses penuh semua tema UI & Privacy Spoiler'
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

  const tierFooter = !isVip
    ? `QUOTA ${sisaFree}/3`
    : String(user.vip_tier).toUpperCase() === 'ULTRA'
      ? '👑 ULTRA UNLIMITED'
      : '⚡ STANDARD UNLIMITED';

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
