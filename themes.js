function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>');
}

function formatIDR(num) {
  return 'Rp ' + Number(num).toLocaleString('id-ID');
}

function toSmallCaps(value) {
  const map = {
    a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ',
    k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 's', t: 'ᴛ',
    u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
  };
  return String(value).toLowerCase().replace(/[a-z]/g, (char) => map[char] || char);
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

function formatSensitiveNumber(formattedNumber, privacyMode) {
  if (!privacyMode) return '<code>' + escapeHtml(formattedNumber) + '</code>';
  const parts = formattedNumber.split(/[-\s]/);
  if (parts.length >= 3) {
    const visible = parts.slice(0, 2).join(' ');
    const hidden = parts.slice(2).join('-');
    return '<code>' + escapeHtml(visible) + '-</code><tg-spoiler><code>' + escapeHtml(hidden) + '</code></tg-spoiler>';
  }
  return '<tg-spoiler><code>' + escapeHtml(formattedNumber) + '</code></tg-spoiler>';
}

function line() {
  return '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501';
}

function softLine() {
  return '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500';
}

function renderDashboard({ user, isVip, isOwner = false, brandName }) {
  const identity = escapeHtml(user.full_name || 'Pengguna');
  const username = user.username && user.username !== '-' ? '@' + escapeHtml(user.username) : 'Tidak tersedia';
  const totalCount = Number(user.total_checks || 0);
  const total = totalCount.toLocaleString('id-ID');
  const access = isOwner ? 'OWNER' : isVip ? 'PREMIUM' : 'BASIC';
  const quota = isOwner || isVip
    ? 'Tanpa batas'
    : Math.max(0, 3 - Number(user.free_used_today || 0)) + ' / 3 tersisa';
  const level = isOwner ? 'Owner' : isVip ? 'Premium' : totalCount >= 100 ? 'Active' : 'Regular';
  const brand = escapeHtml(brandName || 'META DETECT');

  return [
    '<b>' + brand + '</b>',
    '<i>WhatsApp Number Intelligence</i>',
    line(),
    '',
    '<b>STATUS AKUN</b>',
    softLine(),
    'Nama     \u00b7  <b>' + identity + '</b>',
    'User     \u00b7  <b>' + username + '</b>',
    'ID       \u00b7  <code>' + user.telegram_id + '</code>',
    'Akses    \u00b7  <b>' + access + '</b>',
    'Kuota    \u00b7  <b>' + escapeHtml(quota) + '</b>',
    'Total    \u00b7  <b>' + total + '</b> deteksi',
    'Level    \u00b7  <b>' + level + '</b>',
    '',
    '<blockquote>Pilih menu di bawah untuk memulai deteksi, melihat statistik, atau mengundang teman.</blockquote>',
    '',
    '<i>Sistem aktif</i>'
  ].join('\n');
}

function renderStatus({ user, isVip, isOwner = false, referralStats }) {
  const remaining = Math.max(0, 3 - Number(user.free_used_today || 0));
  const expiry = isOwner ? 'Tanpa batas' : isVip ? formatDateWIB(user.vip_until) : 'Belum berlangganan';
  const access = isOwner ? 'OWNER' : isVip ? 'PREMIUM' : 'BASIC';

  return [
    '<b>RINGKASAN STATUS</b>',
    '<i>Keanggotaan & aktivitas akun</i>',
    line(),
    '',
    '<b>PROFIL</b>',
    softLine(),
    'Nama     \u00b7  <b>' + escapeHtml(user.full_name || 'Pengguna') + '</b>',
    'ID       \u00b7  <code>' + user.telegram_id + '</code>',
    'Akses    \u00b7  <b>' + access + '</b>',
    'Kuota    \u00b7  <b>' + (isVip || isOwner ? 'Tanpa batas' : remaining + ' / 3 tersisa') + '</b>',
    'Total    \u00b7  <b>' + Number(user.total_checks || 0).toLocaleString('id-ID') + '</b> pemeriksaan',
    'Aktif s/d \u00b7  <b>' + escapeHtml(expiry) + '</b>',
    '',
    '<b>REFERRAL</b>',
    softLine(),
    'Teman bergabung  \u00b7  <b>' + Number(referralStats.total || 0).toLocaleString('id-ID') + '</b>',
    'Hadiah diterima  \u00b7  <b>' + Number(referralStats.rewarded || 0) + '</b> hari premium',
    '',
    '<i>Sistem aktif</i>'
  ].join('\n');
}

function renderLeaderboard(rows) {
  const lines = rows.length
    ? rows.slice(0, 10).map((row, index) => {
        const rank = String(index + 1).padStart(2, '0');
        const name = escapeHtml(row.full_name || 'Pengguna');
        const count = Number(row.total_checks || 0).toLocaleString('id-ID');
        return '<b>#' + rank + '</b>  ' + name + '\n      <code>' + count + '</code> pemeriksaan';
      }).join('\n\n')
    : '<i>Belum ada data. Jadilah pengguna pertama di papan peringkat.</i>';

  return [
    '<b>TOP 10 DETECTOR</b>',
    '<i>Peringkat berdasarkan total pemeriksaan</i>',
    line(),
    '',
    lines,
    '',
    softLine(),
    '<i>Update otomatis setelah setiap sesi deteksi</i>'
  ].join('\n');
}

function renderReferral({ link, stats }) {
  return [
    '<b>PROGRAM REFERRAL</b>',
    '<i>Undang teman \u00b7 kumpulkan koin \u00b7 tukar hadiah</i>',
    line(),
    '',
    '<b>CARA MENDAPATKAN KOIN</b>',
    softLine(),
    '1. Bagikan tautan undanganmu',
    '2. Teman bergabung melalui tautan',
    '3. Teman menyelesaikan 3 pemeriksaan',
    '4. Kamu mendapat <b>+5 koin</b>',
    '',
    '<b>STATISTIK</b>',
    softLine(),
    'Teman bergabung   \u00b7  <b>' + Number(stats.total || 0) + '</b>',
    'Undangan berhasil \u00b7  <b>' + Number(stats.rewarded || 0) + '</b>',
    'Saldo koin        \u00b7  <b>' + Number(stats.coins || 0) + '</b>',
    '',
    '<b>TAUTAN UNDANGAN</b>',
    '<code>' + escapeHtml(link) + '</code>',
    '',
    '<blockquote>Tekan tombol bagikan untuk mengirim tautan ke teman. Jumlah undangan tidak dibatasi.</blockquote>'
  ].join('\n');
}

function renderReferralExchange(stats) {
  return [
    '<b>PENUKARAN KOIN</b>',
    line(),
    '',
    'Saldo koin \u00b7  <b>' + Number(stats.coins || 0) + '</b>',
    '',
    '<b>PAKET TERSEDIA</b>',
    softLine(),
    '5 koin   \u2192  +10 kuota deteksi',
    '15 koin  \u2192  Premium 3 hari',
    '30 koin  \u2192  Premium 7 hari',
    '100 koin \u2192  Premium 30 hari',
    '',
    '<blockquote>Kumpulkan koin dengan mengundang teman, lalu tukar melalui tombol di bawah.</blockquote>'
  ].join('\n');
}

function renderStoreCatalog({ user, packages }) {
  const access = user && (String(user.vip_tier || '').toUpperCase() === 'OWNER' || Number(user.vip_until || 0) > Math.floor(Date.now() / 1000))
    ? 'PREMIUM'
    : 'BASIC';

  const packageLines = (packages || []).map((pkg) => {
    const perDay = Math.round(pkg.price / pkg.duration_days);
    return (
      '<b>' + Number(pkg.duration_days) + ' hari</b>  \u2014  <b>' + formatIDR(pkg.price) + '</b>\n' +
      '   setara ' + formatIDR(perDay) + ' / hari \u00b7 <i>' + escapeHtml(pkg.tag || '') + '</i>'
    );
  }).join('\n\n');

  return [
    '<b>META DETECT \u00b7 PREMIUM</b>',
    '<i>Akses tanpa batas untuk pemeriksaan massal</i>',
    line(),
    '',
    '<b>STATUS ANDA</b>',
    softLine(),
    'Role \u00b7  <b>' + access + ' USER</b>',
    '',
    '<b>MANFAAT PREMIUM</b>',
    softLine(),
    '\u00b7 Deteksi hingga 30 nomor per kiriman',
    '\u00b7 Kuota mengikuti paket aktif',
    '\u00b7 Hasil dikelompokkan per status',
    '\u00b7 Prioritas proxy sesuai negara nomor',
    '',
    '<b>PILIH DURASI</b>',
    softLine(),
    packageLines || '<i>Paket belum tersedia</i>',
    '',
    '<blockquote>Pilih paket melalui tombol di bawah. Detail tagihan muncul sebelum pembayaran.</blockquote>'
  ].join('\n');
}

function renderPackageDetailCard({ user, pkg }) {
  const perDay = Math.round(pkg.price / pkg.duration_days);
  return [
    '<b>DETAIL PAKET</b>',
    '<i>Periksa rincian sebelum melanjutkan</i>',
    line(),
    '',
    '<b>RINCIAN PESANAN</b>',
    softLine(),
    'Masa aktif  \u00b7  <b>' + escapeHtml(pkg.durationLabel) + '</b>',
    'Harga       \u00b7  <b>' + formatIDR(pkg.price) + '</b>',
    'Biaya harian \u00b7  <code>' + formatIDR(perDay) + '</code>',
    'Metode      \u00b7  <b>Konfirmasi manual</b>',
    '',
    '<b>FITUR PREMIUM</b>',
    softLine(),
    '\u00b7 Kuota pemeriksaan mengikuti paket',
    '\u00b7 Tampilan hasil dengan kategori status',
    '\u00b7 Akses fitur premium selama masa aktif',
    '',
    pkg.highlight ? '<i>' + escapeHtml(pkg.highlight) + '</i>' : '',
    '',
    '<blockquote>Tekan tombol beli untuk melihat petunjuk pembayaran.</blockquote>'
  ].filter(Boolean).join('\n');
}

function renderPaymentMaintenanceCard({ user, pkg }) {
  return [
    '<b>KONFIRMASI PEMBELIAN</b>',
    line(),
    '',
    '<b>RINCIAN</b>',
    softLine(),
    'Produk  \u00b7  <b>META DETECT PREMIUM</b>',
    'Durasi  \u00b7  <b>' + escapeHtml(pkg.durationLabel) + '</b>',
    'Total   \u00b7  <b>' + formatIDR(pkg.price) + '</b>',
    '',
    '<blockquote expandable>Pembayaran otomatis belum tersedia. Silakan kembali ke katalog paket atau hubungi admin untuk aktivasi manual.</blockquote>',
    '',
    '<i>Pastikan pembayaran hanya melalui kanal resmi admin.</i>'
  ].join('\n');
}

function renderDetectionSummary({ results, elapsedSeconds }) {
  const groups = { ready: [], cooldown: [], clone: [], smsUnavailable: [], restricted: [], failed: [] };
  for (const item of results) {
    const number = '<code>' + escapeHtml(item.number || '-') + '</code>';
    if (item.error) groups.failed.push(number);
    else if (item.result.isBanned) groups.restricted.push(number);
    else if (item.result.isCloneBlocked) groups.clone.push(number);
    else if (item.result.anyCooldown) {
      const sms = item.result.channels && item.result.channels.sms;
      const timer = sms && (sms.formatted || sms.uiTimer || sms.humanTime);
      groups.cooldown.push(number + (timer ? ' \u2014 ' + escapeHtml(timer) : ''));
    } else if (item.result.isReady) groups.ready.push(number);
    else if (item.result.smsAvailable === false) groups.smsUnavailable.push(number);
    else groups.failed.push(number);
  }
  return [
    '<b>HASIL DETEKSI</b>',
    ...(groups.ready.length ? ['', '<b>SIAP DIVERIFIKASI</b>', ...groups.ready] : []),
    ...(groups.cooldown.length ? ['', '<b>COOLDOWN WHATSAPP</b>', ...groups.cooldown] : []),
    ...(groups.clone.length ? ['', '<b>TIDAK SUPPORT CLONE</b>', ...groups.clone] : []),
    ...(groups.smsUnavailable.length ? ['', '<b>OPSI SMS TIDAK DITEMUKAN</b>', ...groups.smsUnavailable] : []),
    ...(groups.restricted.length ? ['', '<b>DIBATASI</b>', ...groups.restricted] : []),
    ...(groups.failed.length ? ['', '<b>GAGAL DIPROSES</b>', ...groups.failed] : []),
    '',
    'Proses  \u00b7  ' + Math.max(0, Number(elapsedSeconds) || 0) + 'd'
  ].join('\n');
}

function renderCooldownCard({ result, user, isVip }) {
  const remaining = Math.max(0, 3 - Number(user.free_used_today || 0));
  const numberDisplay = formatSensitiveNumber(result.formattedNumber, Boolean(user.privacy_mode));
  const sms = result.channels.sms;
  const status = result.isBanned ? 'DIBLOKIR' : result.anyCooldown ? 'COOLDOWN AKTIF' : 'SIAP';
  const verdict = result.isBanned
    ? 'Nomor terdeteksi memiliki pembatasan dari layanan WhatsApp.'
    : result.anyCooldown
      ? 'Nomor masih berada dalam masa tunggu verifikasi.'
      : 'Tidak ditemukan masa tunggu aktif pada pemeriksaan ini.';
  const access = String(user.vip_tier).toUpperCase() === 'OWNER'
    ? 'OWNER ACCESS'
    : !isVip ? 'FREE \u00b7 ' + remaining + '/3' : 'PREMIUM ACCESS';

  return [
    '<b>HASIL PEMERIKSAAN</b>',
    '<i>Analisis status nomor WhatsApp</i>',
    line(),
    '',
    '<b>TARGET</b>',
    softLine(),
    'Nomor   \u00b7  ' + numberDisplay,
    'Negara  \u00b7  <b>' + escapeHtml(result.region) + '</b>',
    'Status  \u00b7  <b>' + status + '</b>',
    'Jalur   \u00b7  <code>' + escapeHtml(result.proxyInfo) + '</code>',
    '',
    '<b>ANALISIS</b>',
    softLine(),
    verdict,
    '',
    '<b>VERIFIKASI SMS</b>',
    softLine(),
    'Masa tunggu \u00b7  <b>' + (sms.isCooldown ? escapeHtml(sms.uiTimer) : 'Tidak aktif') + '</b>',
    'Durasi      \u00b7  <code>' + (sms.isCooldown ? escapeHtml(sms.humanTime) : 'Ready') + '</code>',
    '',
    '<i>' + formatDateWIB(Math.floor(Date.now() / 1000)) + ' \u00b7 ' + access + '</i>'
  ].join('\n');
}

module.exports = {
  escapeHtml,
  formatIDR,
  formatDateWIB,
  renderDashboard,
  renderStatus,
  renderLeaderboard,
  renderReferral,
  renderReferralExchange,
  renderStoreCatalog,
  renderPackageDetailCard,
  renderPaymentMaintenanceCard,
  renderCooldownCard,
  renderDetectionSummary
};
