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
  const access = isOwner ? 'OWNER ACCESS' : isVip ? 'PREMIUM MEMBER' : 'FREE MEMBER';
  const quota = isOwner ? 'TANPA BATAS · AKSES OWNER' : isVip ? 'TANPA BATAS · 10 NOMOR / KIRIM' : remaining + ' / 3 PEMERIKSAAN TERSISA';
  const identity = escapeHtml(user.full_name || 'Pengguna');
  const username = user.username && user.username !== '-' ? '@' + escapeHtml(user.username) : 'Belum diatur';
  const total = Number(user.total_checks || 0).toLocaleString('id-ID');
  const level = isOwner ? 'OWNER' : isVip ? 'PREMIUM' : total >= 100 ? 'ADVANCED' : total >= 25 ? 'ACTIVE' : 'REGULER';
  return [
    '✦ <b>' + escapeHtml(brandName || 'META DETECT') + '</b>',
    '<i>ADVANCED WHATSAPP TELEMETRY</i>',
    '<code>━━━━━━━━━━━━━━━━━━━━━━━━</code>',
    '',
    '┌ <b>⚙ STATUS AKUN</b>',
    '├ Nama      : <b>✧ ' + identity + ' ✧</b>',
    '├ Username  : <b>' + username + '</b>',
    '├ ID        : <code>' + user.telegram_id + '</code>',
    '├ Akses     : <b>' + access + '</b>',
    '├ Kuota     : <b>' + escapeHtml(quota) + '</b>',
    '├ Total     : <b>' + total + ' deteksi</b>',
    '└ Level     : <b>' + level + '</b>',
    '',
    '<code>━━━━━━━━━━━━━━━━━━━━━━━━</code>',
    '⌁ <b>PUSAT KONTROL</b>',
    'Pilih menu di keyboard untuk mulai mendeteksi, melihat statistik, mengikuti peringkat, atau mengundang teman.',
    '',
    '<i>◈ SISTEM AKTIF · ' + (isOwner ? 'OWNER MODE' : isVip ? 'PREMIUM MODE' : 'FREE MODE') + '</i>'
  ].join('\\n');
}

function renderStatus({ user, isVip, isOwner = false, referralStats }) {
  const used = Number(user.free_used_today || 0);
  const remaining = Math.max(0, 3 - used);
  const expiry = isOwner ? 'Tidak terbatas' : isVip ? formatDateWIB(user.vip_until) : 'Belum berlangganan';
  return [
    '◈ <b>STATUS & STATISTIK AKUN</b>',
    '<code>━━━━━━━━━━━━━━━━━━━━━━━━</code>',
    '✦ Nama       : <b>' + escapeHtml(user.full_name || 'Pengguna') + '</b>',
    '⌁ Telegram  : <code>' + user.telegram_id + '</code>',
    '♛ Keanggotaan: <b>' + (isOwner ? 'OWNER' : isVip ? 'PREMIUM' : 'GRATIS') + '</b>',
    '◉ Kuota hari ini: <b>' + (isVip ? 'Tanpa batas' : remaining + ' dari 3 tersisa') + '</b>',
    '⌗ Total deteksi: <b>' + Number(user.total_checks || 0).toLocaleString('id-ID') + '</b>',
    '⌛ Masa aktif: <b>' + expiry + '</b>',
    '',
    '♧ <b>PROGRAM UNDANGAN</b>',
    'Teman bergabung: <b>' + Number(referralStats.total || 0) + ' / 10</b>',
    'Hadiah diberikan: <b>' + Number(referralStats.rewarded || 0) + ' hari Premium</b>'
  ].join('\\n');
}

function renderLeaderboard(rows) {
  const medals = ['🥇', '🥈', '🥉'];
  const lines = rows.length
    ? rows.map((row, index) => (medals[index] || (index + 1) + '.') + ' <b>' + escapeHtml(row.full_name || 'Pengguna') + '</b> — <code>' + Number(row.total_checks || 0).toLocaleString('id-ID') + '</code>').join('\\n')
    : 'Belum ada aktivitas untuk ditampilkan. Jadilah pengguna pertama di papan peringkat!';
  return [
    '🏆 <b>LEADERBOARD DETECTOR</b>',
    '<i>10 akun dengan aktivitas pemeriksaan tertinggi</i>',
    '<code>━━━━━━━━━━━━━━━━━━━━━━━━</code>',
    lines,
    '',
    '<i>Peringkat dihitung dari aktivitas akun, diperbarui setelah pemeriksaan.</i>'
  ].join('\\n');
}

function renderReferral({ link, stats }) {
  return [
    '🎁 <b>PROGRAM REFER & REWARD</b>',
    '<i>Ajak teman bergabung, kumpulkan hari Premium!</i>',
    '<code>━━━━━━━━━━━━━━━━━━━━━━━━</code>',
    '♧ <b>HADIAH KAMU</b>',
    '• 1 teman yang memenuhi syarat = <b>1 hari Premium</b>',
    '• Teman harus menyelesaikan 3 pemeriksaan pertama',
    '• Maksimal 10 teman yang dapat didaftarkan',
    '• Satu akun hanya dapat dihitung sekali',
    '',
    '⌁ <b>TAUTAN UNDANGAN</b>',
    '<code>' + escapeHtml(link) + '</code>',
    '',
    'Teman bergabung: <b>' + Number(stats.total || 0) + ' / 10</b>',
    'Total hadiah: <b>' + Number(stats.rewarded || 0) + ' hari Premium</b>',
    '',
    '<i>Bagikan tautanmu dan pantau hadiah melalui menu Status.</i>'
  ].join('\\n');
}
function renderStoreCatalog({ packages }) {
  const packageLines = packages.map((pkg, index) => {
    const perDay = Math.round(pkg.price / pkg.duration_days);
    return '<b>' + (index + 1) + '. ' + escapeHtml(pkg.durationLabel) + '</b>  ·  <b>' +
      formatIDR(pkg.price) + '</b>  <i>' + escapeHtml(pkg.tag) + '</i>\n' +
      '<i>Setara ' + formatIDR(perDay) + ' / hari</i>';
  }).join('\n\n');
  return [
    '✦ <b>AKSES PREMIUM META DETECT</b>',
    '<i>Satu keanggotaan. Semua fitur utama. Pengalaman lebih leluasa.</i>',
    '<code>━━━━━━━━━━━━━━━━━━━━━━━━</code>',
    '',
    '◈ <b>APA YANG KAMU DAPATKAN</b>',
    '✧ Pemeriksaan tanpa batas selama masa aktif',
    '✧ Hingga 10 nomor dalam satu kiriman',
    '✧ Rotasi proxy otomatis',
    '✧ Antrean pemeriksaan prioritas',
    '✧ Akses penuh ke fitur Premium',
    '',
    '▤ <b>PILIH MASA AKTIF</b>',
    '<code>━━━━━━━━━━━━━━━━━━━━━━━━</code>',
    packageLines,
    '',
    '<i>Pilih durasi yang paling sesuai. Rincian dan total pembayaran akan ditampilkan sebelum konfirmasi.</i>'
  ].join('\n');
}
function renderPackageDetailCard({ pkg }) {
  const perDay = Math.round(pkg.price / pkg.duration_days);
  return [
    '✦ <b>RINCIAN AKSES PREMIUM</b>',
    '<code>━━━━━━━━━━━━━━━━━━━━━━━━</code>',
    '',
    '◈ Masa aktif   <b>' + escapeHtml(pkg.durationLabel) + '</b>',
    '◈ Harga        <b>' + formatIDR(pkg.price) + '</b>',
    '◈ Biaya harian <code>' + formatIDR(perDay) + '</code>',
    '◈ Kapasitas    <code>10 nomor / kiriman</code>',
    '',
    '✧ Pemeriksaan tanpa batas selama masa aktif',
    '✧ Rotasi proxy otomatis',
    '✧ Akses seluruh fitur Premium',
    '',
    '<i>' + escapeHtml(pkg.highlight) + '</i>',
    '',
    '<i>Periksa kembali pilihanmu sebelum melanjutkan.</i>'
  ].join('\n');
}
function renderPaymentMaintenanceCard({ pkg }) {
  return [
    '✦ <b>RINGKASAN PESANAN</b>',
    '<code>━━━━━━━━━━━━━━━━━━━━━━━━</code>',
    '',
    '◈ Produk       <b>PREMIUM META DETECT</b>',
    '◈ Masa aktif   <b>' + escapeHtml(pkg.durationLabel) + '</b>',
    '◈ Total bayar  <b>' + formatIDR(pkg.price) + '</b>',
    '',
    '⌁ <b>LANGKAH SELANJUTNYA</b>',
    'Pembayaran otomatis belum tersedia. Hubungi admin untuk menyelesaikan pembayaran dan aktivasi.',
    '',
    '<i>Jangan melakukan pembayaran sebelum menerima instruksi resmi dari admin.</i>'
  ].join('\n');
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
    ? '✧ OWNER ACCESS'
    : !isVip
      ? `KUOTA ${sisaFree}/3`
      : '✦ PREMIUM ACCESS';

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
  renderStatus,
  renderLeaderboard,
  renderReferral,
  renderStoreCatalog,
  renderPackageDetailCard,
  renderPaymentMaintenanceCard,
  renderCooldownCard
};
