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
  const identity = escapeHtml(user.full_name || 'Pengguna');
  const username = user.username && user.username !== '-' ? '@' + escapeHtml(user.username) : 'Tidak tersedia';
  const total = Number(user.total_checks || 0).toLocaleString('id-ID');
  const access = isOwner ? 'ᴏᴡɴᴇʀ ᴀᴄᴄᴇss' : isVip ? 'ᴘʀᴇᴍɪᴜᴍ' : 'ғʀᴇᴇ ᴍᴇᴍʙᴇʀ';
  const quota = isOwner ? 'ᴛᴀɴᴘᴀ ʙᴀᴛᴀs · ᴏᴡɴᴇʀ' : isVip ? 'ᴛᴀɴᴘᴀ ʙᴀᴛᴀs' : Math.max(0, 3 - Number(user.free_used_today || 0)) + ' / 3 ᴛᴇʀsɪsᴀ';
  const level = isOwner ? 'ᴏᴡɴᴇʀ' : isVip ? 'ᴘʀᴇᴍɪᴜᴍ' : total >= 100 ? 'ᴀᴄᴛɪᴠᴇ' : 'ʀᴇɢᴜʟᴇʀ';
  return [
    '✦ <b>ᴍᴇᴛᴀ ᴅᴇᴛᴇᴄᴛ</b> ✦',
    '<i>ᴀᴅᴠᴀɴᴄᴇᴅ ᴡʜᴀᴛsᴀᴘᴘ ᴛᴇʟᴇᴍᴇᴛʀʏ</i>',
    '',
    '⚙ <b>sᴛᴀᴛᴜs ᴀᴋᴜɴ</b>',
    '▸ ɴᴀᴍᴀ ⦂ <b>' + identity + '</b>',
    '▸ ᴜsᴇʀ ⦂ <b>' + username + '</b>',
    '▸ ɪᴅ ⦂ <code>' + user.telegram_id + '</code>',
    '▸ ᴀᴋsᴇs ⦂ <b>' + access + '</b>',
    '▸ ᴋᴜᴏᴛᴀ ⦂ <b>' + escapeHtml(quota) + '</b>',
    '▸ ᴛᴏᴛᴀʟ ⦂ <b>' + total + ' ᴅᴇᴛᴇᴋsɪ</b>',
    '▸ ʟᴇᴠᴇʟ ⦂ <b>' + level + '</b>',
    '',
    '⌁ <b>ᴘᴜsᴀᴛ ᴋᴏɴᴛʀᴏʟ</b>',
    'ᴘɪʟɪʜ ᴍᴇɴᴜ ᴅɪ ʙᴀᴡᴀʜ ᴜɴᴛᴜᴋ ᴍᴜʟᴀɪ ᴍᴇɴᴅᴇᴛᴇᴋsɪ, ᴍᴇʟɪʜᴀᴛ sᴛᴀᴛɪsᴛɪᴋ, ᴀᴛᴀᴜ ᴍᴇɴɢᴜɴᴅᴀɴɢ ᴛᴇᴍᴀɴ.',
    '',
    '◈ sɪsᴛᴇᴍ ᴀᴋᴛɪꜰ'
  ].join('\\n');
}function renderStatus({ user, isVip, isOwner = false, referralStats }) {
  const used = Number(user.free_used_today || 0);
  const remaining = Math.max(0, 3 - used);
  const expiry = isOwner ? 'Tidak terbatas' : isVip ? formatDateWIB(user.vip_until) : 'Belum berlangganan';
  return [
    '◈ <b>RINGKASAN AKUN</b>',
    '<i>Informasi keanggotaan dan aktivitasmu</i>',
    '<code>━━━━━━━━━━━━━━━━━━━━━━━━━━</code>',
    '',
    '╭─ <b>AKSES & PEMAKAIAN</b>',
    '├ ✧ Nama        : <b>' + escapeHtml(user.full_name || 'Pengguna') + '</b>',
    '├ ⌁ ID Telegram : <code>' + user.telegram_id + '</code>',
    '├ ♛ Keanggotaan : <b>' + (isOwner ? 'OWNER' : isVip ? 'PREMIUM' : 'GRATIS') + '</b>',
    '├ ◉ Kuota hari ini: <b>' + (isVip ? 'Tanpa batas' : remaining + ' dari 3 tersisa') + '</b>',
    '├ ⌗ Total deteksi: <b>' + Number(user.total_checks || 0).toLocaleString('id-ID') + ' nomor</b>',
    '╰ ⌛ Masa aktif  : <b>' + expiry + '</b>',
    '',
    '╭─ <b>PROGRAM REFERAL</b>',
    '├ Teman terdaftar : <b>' + Number(referralStats.total || 0) + ' / 10</b>',
    '╰ Hadiah diterima : <b>' + Number(referralStats.rewarded || 0) + ' hari Premium</b>',
    '',
    '<i>Terus gunakan MetaDetect untuk meningkatkan aktivitas akunmu.</i>'
  ].join('\n');
}

function renderLeaderboard(rows) {
  const medals = ['🥇', '🥈', '🥉'];
  const lines = rows.length
    ? rows.slice(0, 10).map((row, index) => {
        const rank = String(index + 1).padStart(2, '0');
        const medal = medals[index] || rank;
        const name = escapeHtml(row.full_name || 'Pengguna');
        const count = Number(row.total_checks || 0).toLocaleString('id-ID');
        return medal + ' ✧ <b>' + name + '</b>\\n      └ <b>' + count + '</b> ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ';
      }).join('\\n\\n')
    : 'Belum ada data pemeriksaan. Jadilah pengguna pertama di papan peringkat!';
  return [
    '♛ <b>𝗧𝗢𝗣 𝟭𝟬 𝗗𝗘𝗧𝗘𝗖𝗧𝗢𝗥 • 𝗠𝗘𝗧𝗔𝗗𝗘𝗧𝗘𝗖𝗧</b> ♛',
    '',
    lines,
    '',
    '♧ sᴛᴀᴛᴜs ᴅɪ ᴀᴛᴀs ᴀᴅᴀʟᴀʜ ᴜsᴇʀ ʏᴀɴɢ ᴘᴀʟɪɴɢ ɢᴏᴋɪʟ 🥴'
  ].join('\\n');
}function renderReferral({ link, stats }) {
  return [
    '🎁 <b>PROGRAM REFERAL & HADIAH</b>',
    '<i>Bagikan MetaDetect. Ajak teman. Kumpulkan Premium.</i>',
    '<code>━━━━━━━━━━━━━━━━━━━━━━━━━━</code>',
    '',
    '╭─ <b>MEKANISME HADIAH</b>',
    '├ ✦ Undang teman melalui tautan pribadimu',
    '├ ✦ Teman menyelesaikan 3 pemeriksaan pertama',
    '├ 🎁 Kamu memperoleh 1 hari Premium',
    '├ ◈ Maksimal 10 undangan yang memenuhi syarat',
    '╰ ⛨ Satu akun hanya dihitung satu kali',
    '',
    '╭─ <b>TAUTAN UNDANGAN PRIBADI</b>',
    '<code>' + escapeHtml(link) + '</code>',
    '╰ Tekan tombol bagikan untuk mengirim tautan ke teman.',
    '',
    '◉ Teman bergabung : <b>' + Number(stats.total || 0) + ' / 10</b>',
    '🎁 Hadiah terkumpul: <b>' + Number(stats.rewarded || 0) + ' hari Premium</b>',
    '',
    '<i>Ajak temanmu mulai hari ini dan pantau progres hadiah melalui menu Status.</i>'
  ].join('\n');
}

function renderStoreCatalog({ packages }) {
  const packageLines = packages.map((pkg, index) => {
    const perDay = Math.round(pkg.price / pkg.duration_days);
    const marker = ['✦', '◈', '✧', '◆', '♛'][index] || '▪';
    return marker + ' <b>' + escapeHtml(pkg.durationLabel) + '</b>  ·  <b>' + formatIDR(pkg.price) + '</b>  <i>' + escapeHtml(pkg.tag) + '</i>\n   <i>Setara ' + formatIDR(perDay) + ' per hari</i>';
  }).join('\n\n');
  return [
    '✧ <b>PREMIUM MEMBERSHIP</b>',
    '<i>Tingkatkan pengalaman deteksi dengan akses yang lebih leluasa.</i>',
    '<code>━━━━━━━━━━━━━━━━━━━━━━━━━━</code>',
    '',
    '╭─ <b>KEUNTUNGAN PREMIUM</b>',
    '├ ⚡ Pemeriksaan tanpa batas selama masa aktif',
    '├ ◈ Hingga 10 nomor dalam satu kiriman',
    '├ ⛨ Rotasi proxy otomatis',
    '├ ✦ Akses fitur Premium dan antrean prioritas',
    '╰ ♛ Dukungan untuk penggunaan rutin',
    '',
    '╭─ <b>PILIH DURASI KEANGGOTAAN</b>',
    packageLines,
    '╰─',
    '',
    '<i>Pilih durasi melalui tombol paket. Rincian harga dan masa aktif akan ditampilkan sebelum melanjutkan.</i>'
  ].join('\n');
}

function renderPackageDetailCard({ pkg }) {
  const perDay = Math.round(pkg.price / pkg.duration_days);
  return [
    '✧ <b>KONFIRMASI PAKET PREMIUM</b>',
    '<i>Periksa kembali rincian keanggotaan pilihanmu.</i>',
    '<code>━━━━━━━━━━━━━━━━━━━━━━━━━━</code>',
    '',
    '╭─ <b>RINCIAN PAKET</b>',
    '├ ◈ Masa aktif    : <b>' + escapeHtml(pkg.durationLabel) + '</b>',
    '├ ✦ Harga        : <b>' + formatIDR(pkg.price) + '</b>',
    '├ ⌁ Biaya harian : <code>' + formatIDR(perDay) + '</code>',
    '╰ ◉ Kapasitas    : <code>10 nomor / kiriman</code>',
    '',
    '╭─ <b>FITUR PREMIUM</b>',
    '├ ⚡ Pemeriksaan tanpa batas selama masa aktif',
    '├ ⛨ Rotasi proxy otomatis',
    '╰ ✧ Akses seluruh fitur Premium',
    '',
    '<i>' + escapeHtml(pkg.highlight) + '</i>',
    '',
    '<i>Lanjutkan melalui tombol konfirmasi untuk melihat petunjuk pembayaran.</i>'
  ].join('\n');
}

function renderPaymentMaintenanceCard({ pkg }) {
  return [
    '▣ <b>RINGKASAN PEMESANAN</b>',
    '<i>Pastikan pilihan paket sudah sesuai.</i>',
    '<code>━━━━━━━━━━━━━━━━━━━━━━━━━━</code>',
    '',
    '╭─ <b>DETAIL PESANAN</b>',
    '├ ✧ Produk       : <b>PREMIUM META DETECT</b>',
    '├ ◈ Masa aktif   : <b>' + escapeHtml(pkg.durationLabel) + '</b>',
    '╰ 💳 Total bayar : <b>' + formatIDR(pkg.price) + '</b>',
    '',
    '⚠️ <b>PEMBAYARAN OTOMATIS BELUM TERSEDIA</b>',
    'Untuk menyelesaikan pembelian, hubungi admin melalui tombol di bawah. Admin akan memberikan instruksi pembayaran dan mengaktifkan Premium setelah pembayaran dikonfirmasi.',
    '',
    '<i>⛨ Demi keamanan, jangan membayar ke rekening atau QRIS selain yang diberikan melalui kanal resmi admin.</i>'
  ].join('\n');
}

function renderCooldownCard({ result, user, isVip }) {
  const sisaFree = Math.max(0, 3 - Number(user.free_used_today || 0));
  const numberDisplay = formatSensitiveNumber(result.formattedNumber, Boolean(user.privacy_mode));
  const sms = result.channels.sms;
  const status = result.isBanned ? 'DIBLOKIR' : result.anyCooldown ? 'COOLDOWN AKTIF' : 'SIAP';
  const verdict = result.isBanned
    ? 'Nomor terdeteksi memiliki pembatasan dari layanan WhatsApp.'
    : result.anyCooldown
      ? 'Nomor masih berada dalam masa tunggu verifikasi.'
      : 'Tidak ditemukan masa tunggu aktif pada pemeriksaan ini.';
  const tierFooter = String(user.vip_tier).toUpperCase() === 'OWNER'
    ? '♛ OWNER ACCESS'
    : !isVip ? 'KUOTA ' + sisaFree + '/3' : '✦ PREMIUM ACCESS';
  return [
    '✦ <b>HASIL PEMERIKSAAN WHATSAPP</b>',
    '<code>━━━━━━━━━━━━━━━━━━━━━━━━━━</code>',
    '',
    '╭─ <b>INFORMASI TARGET</b>',
    '├ ☎ Nomor  : ' + numberDisplay + ' <code>(' + escapeHtml(result.region) + ')</code>',
    '├ ◈ Status : <b>' + status + '</b>',
    '├ ⛨ Jalur  : <code>' + escapeHtml(result.proxyInfo) + '</code>',
    '╰ ✧ Hasil  : ' + verdict,
    '',
    '╭─ <b>STATUS VERIFIKASI SMS</b>',
    '├ ' + (sms.isCooldown ? '⏳ Masa tunggu: <b>' + escapeHtml(sms.uiTimer) + '</b>' : '✓ Tidak ada masa tunggu aktif'),
    '╰ ⌁ Rincian: <code>' + (sms.isCooldown ? escapeHtml(sms.humanTime) : 'Siap') + '</code>',
    '',
    '<code>━━━━━━━━━━━━━━━━━━━━━━━━━━</code>',
    '<i>' + formatDateWIB(Math.floor(Date.now() / 1000)) + ' · ' + tierFooter + '</i>'
  ].join('\n');
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
