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
  const totalCount = Number(user.total_checks || 0);
  const total = totalCount.toLocaleString('id-ID');
  const access = isOwner ? 'ᴏᴡɴᴇʀ ᴀᴄᴄᴇss' : isVip ? 'ᴘʀᴇᴍɪᴜᴍ' : 'ғʀᴇᴇ ᴍᴇᴍʙᴇʀ';
  const quota = isOwner ? 'ᴛᴀɴᴘᴀ ʙᴀᴛᴀs · ᴏᴡɴᴇʀ' : isVip ? 'ᴛᴀɴᴘᴀ ʙᴀᴛᴀs' : Math.max(0, 3 - Number(user.free_used_today || 0)) + ' / 3 ᴛᴇʀsɪsᴀ';
  const level = isOwner ? 'ᴏᴡɴᴇʀ' : isVip ? 'ᴘʀᴇᴍɪᴜᴍ' : totalCount >= 100 ? 'ᴀᴄᴛɪᴠᴇ' : 'ʀᴇɢᴜʟᴇʀ';
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
  ].join('\n');
}

function renderStatus({ user, isVip, isOwner = false, referralStats }) {
  const remaining = Math.max(0, 3 - Number(user.free_used_today || 0));
  const expiry = isOwner ? 'ᴛᴀɴᴘᴀ ʙᴀᴛᴀs' : isVip ? formatDateWIB(user.vip_until) : 'ʙᴇʟᴜᴍ ʙᴇʀʟᴀɴɢɢᴀɴᴀɴ';
  return [
    '◈ <b>ʀɪɴɢᴋᴀsᴀɴ sᴛᴀᴛᴜs ᴀᴋᴜɴ</b> ◈',
    '<i>ɪɴғᴏʀᴍᴀsɪ ᴋᴇᴀɴɢɢᴏᴛᴀᴀɴ & ᴀᴋᴛɪᴠɪᴛᴀs</i>',
    '',
    '⚙ <b>ᴘʀᴏғɪʟ ᴀᴋᴜɴ</b>',
    '▸ ɴᴀᴍᴀ ⦂ <b>' + escapeHtml(user.full_name || 'Pengguna') + '</b>',
    '▸ ɪᴅ ⦂ <code>' + user.telegram_id + '</code>',
    '▸ ᴀᴋsᴇs ⦂ <b>' + (isOwner ? 'ᴏᴡɴᴇʀ ᴀᴄᴄᴇss' : isVip ? 'ᴘʀᴇᴍɪᴜᴍ' : 'ғʀᴇᴇ ᴍᴇᴍʙᴇʀ') + '</b>',
    '▸ ᴋᴜᴏᴛᴀ ⦂ <b>' + (isVip ? 'ᴛᴀɴᴘᴀ ʙᴀᴛᴀs' : remaining + ' / 3 ᴛᴇʀsɪsᴀ') + '</b>',
    '▸ ᴛᴏᴛᴀʟ ⦂ <b>' + Number(user.total_checks || 0).toLocaleString('id-ID') + ' ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ</b>',
    '▸ ᴍᴀsᴀ ᴀᴋᴛɪғ ⦂ <b>' + escapeHtml(expiry) + '</b>',
    '',
    '🎁 <b>ᴘʀᴏɢʀᴀᴍ ʀᴇғᴇʀᴀʟ</b>',
    '▸ ᴛᴇᴍᴀɴ ʙᴇʀɢᴀʙᴜɴɢ ⦂ <b>' + Number(referralStats.total || 0) + ' / 10</b>',
    '▸ ʜᴀᴅɪᴀʜ ᴅɪᴛᴇʀɪᴍᴀ ⦂ <b>' + Number(referralStats.rewarded || 0) + ' ʜᴀʀɪ ᴘʀᴇᴍɪᴜᴍ</b>',
    '',
    '⌁ ᴛᴇʀᴜs ɢᴜɴᴀᴋᴀɴ ᴍᴇᴛᴀ ᴅᴇᴛᴇᴄᴛ ᴜɴᴛᴜᴋ ᴍᴇɴɪɴɢᴋᴀᴛᴋᴀɴ ᴀᴋᴛɪᴠɪᴛᴀs ᴀᴋᴜɴᴍᴜ.',
    '',
    '◈ sɪsᴛᴇᴍ ᴀᴋᴛɪꜰ'
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
        return medal + ' ✧ <b>' + name + '</b>\n      └ <b>' + count + '</b> ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ';
      }).join('\n\n')
    : 'Belum ada data pemeriksaan. Jadilah pengguna pertama di papan peringkat!';
  return [
    '♛ <b>𝗧𝗢𝗣 𝟭𝟬 𝗗𝗘𝗧𝗘𝗖𝗧𝗢𝗥 • 𝗠𝗘𝗧𝗔𝗗𝗘𝗧𝗘𝗖𝗧</b> ♛',
    '',
    lines,
    '',
    '♧ sᴛᴀᴛᴜs ᴅɪ ᴀᴛᴀs ᴀᴅᴀʟᴀʜ ᴜsᴇʀ ʏᴀɴɢ ᴘᴀʟɪɴɢ ɢᴏᴋɪʟ 🥴'
  ].join('\n');
}function renderReferral({ link, stats }) {
  return [
    '🎁 <b>ᴘʀᴏɢʀᴀᴍ ʀᴇғᴇʀᴀʟ & ʜᴀᴅɪᴀʜ</b>',
    '<i>ᴀᴊᴀᴋ ᴛᴇᴍᴀɴ · ᴋᴜᴍᴘᴜʟᴋᴀɴ ᴘʀᴇᴍɪᴜᴍ</i>',
    '',
    '✦ <b>ᴄᴀʀᴀ ᴍᴇɴᴅᴀᴘᴀᴛᴋᴀɴ ʜᴀᴅɪᴀʜ</b>',
    '① ʙᴀɢɪᴋᴀɴ ᴛᴀᴜᴛᴀɴ ᴜɴᴅᴀɴɢᴀɴᴍᴜ.',
    '② ᴛᴇᴍᴀɴ ʙᴇʀɢᴀʙᴜɴɢ ᴍᴇʟᴀʟᴜɪ ᴛᴀᴜᴛᴀɴ.',
    '③ ᴛᴇᴍᴀɴ ᴍᴇɴʏᴇʟᴇsᴀɪᴋᴀɴ 3 ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ.',
    '④ ᴋᴀᴍᴜ ᴍᴇɴᴅᴀᴘᴀᴛᴋᴀɴ 1 ʜᴀʀɪ ᴘʀᴇᴍɪᴜᴍ.',
    '',
    '◈ <b>sᴛᴀᴛɪsᴛɪᴋ ᴜɴᴅᴀɴɢᴀɴ</b>',
    '▸ ᴛᴇᴍᴀɴ ʙᴇʀɢᴀʙᴜɴɢ ⦂ <b>' + Number(stats.total || 0) + ' / 10</b>',
    '▸ ʜᴀᴅɪᴀʜ ᴅɪᴛᴇʀɪᴍᴀ ⦂ <b>' + Number(stats.rewarded || 0) + ' ʜᴀʀɪ ᴘʀᴇᴍɪᴜᴍ</b>',
    '',
    '⌁ <b>ᴛᴀᴜᴛᴀɴ ᴜɴᴅᴀɴɢᴀɴ ᴘʀɪʙᴀᴅɪ</b>',
    '<code>' + escapeHtml(link) + '</code>',
    'ᴛᴇᴋᴀɴ ᴛᴏᴍʙᴏʟ ʙᴀɢɪᴋᴀɴ ᴜɴᴛᴜᴋ ᴍᴇɴɢɪʀɪᴍ ᴛᴀᴜᴛᴀɴ ᴋᴇ ᴛᴇᴍᴀɴ.',
    '',
    '◈ ᴍᴀᴋsɪᴍᴀʟ 10 ᴜɴᴅᴀɴɢᴀɴ ʙᴇʀʜᴀᴅɪᴀʜ'
  ].join('\n');
}

function renderStoreCatalog({ packages }) {
  const packageLines = packages.map((pkg, index) => {
    const perDay = Math.round(pkg.price / pkg.duration_days);
    const marker = ['✦', '◈', '✧', '◆', '♛'][index] || '▪';
    return marker + ' <b>' + escapeHtml(pkg.durationLabel) + '</b> · <b>' + formatIDR(pkg.price) + '</b> <i>' + escapeHtml(pkg.tag) + '</i>\n   <i>sᴇᴛᴀʀᴀ ' + formatIDR(perDay) + ' ᴘᴇʀ ʜᴀʀɪ</i>';
  }).join('\n\n');
  return [
    '✦ <b>ᴍᴇᴛᴀ ᴅᴇᴛᴇᴄᴛ · ᴘʀᴇᴍɪᴜᴍ</b> ✦',
    '<i>ᴀᴋsᴇs ᴘʀᴇᴍɪᴜᴍ ᴜɴᴛᴜᴋ ᴘᴇɴɢɢᴜɴᴀᴀɴ ʏᴀɴɢ ʟᴇʙɪʜ ʟᴇʟᴜᴀsᴀ.</i>',
    '',
    '♛ <b>ᴋᴇᴜɴɢɢᴜʟᴀɴ ᴘʀᴇᴍɪᴜᴍ</b>',
    '✦ ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ ᴛᴀɴᴘᴀ ʙᴀᴛᴀs sᴇʟᴀᴍᴀ ᴍᴀsᴀ ᴀᴋᴛɪғ',
    '✦ ᴍᴀᴋsɪᴍᴀʟ 10 ɴᴏᴍᴏʀ ᴅᴀʟᴀᴍ sᴀᴛᴜ ᴋɪʀɪᴍᴀɴ',
    '✦ ʀᴏᴛᴀsɪ ᴘʀᴏxʏ ᴏᴛᴏᴍᴀᴛɪs',
    '✦ ᴀᴋsᴇs ғɪᴛᴜʀ ᴘʀᴇᴍɪᴜᴍ',
    '',
    '▤ <b>ᴘɪʟɪʜ ᴅᴜʀᴀsɪ ᴘᴀᴋᴇᴛ</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    packageLines,
    '━━━━━━━━━━━━━━━━━━━━',
    '',
    'ᴘɪʟɪʜ sᴀʟᴀʜ sᴀᴛᴜ ᴘᴀᴋᴇᴛ ᴍᴇʟᴀʟᴜɪ ᴛᴏᴍʙᴏʟ ᴅɪ ʙᴀᴡᴀʜ.',
    'ᴅᴇᴛᴀɪʟ ʜᴀʀɢᴀ ᴅᴀɴ ᴍᴀsᴀ ᴀᴋᴛɪғ ᴀᴋᴀɴ ᴅɪᴛᴀᴍᴘɪʟᴋᴀɴ sᴇʙᴇʟᴜᴍ ᴘᴇᴍʙᴀʏᴀʀᴀɴ.'
  ].join('\n');
}

function renderPackageDetailCard({ pkg }) {
  const perDay = Math.round(pkg.price / pkg.duration_days);
  return [
    '✧ <b>ᴅᴇᴛᴀɪʟ ᴘᴀᴋᴇᴛ ᴘʀᴇᴍɪᴜᴍ</b> ✧',
    '<i>ᴘᴇʀɪᴋsᴀ ʀɪɴᴄɪᴀɴ ᴘᴀᴋᴇᴛ sᴇʙᴇʟᴜᴍ ᴍᴇʟᴀɴᴊᴜᴛᴋᴀɴ.</i>',
    '',
    '◈ <b>ʀɪɴᴄɪᴀɴ ᴘᴇsᴀɴᴀɴ</b>',
    '▸ ᴍᴀsᴀ ᴀᴋᴛɪғ ⦂ <b>' + escapeHtml(pkg.durationLabel) + '</b>',
    '▸ ʜᴀʀɢᴀ ⦂ <b>' + formatIDR(pkg.price) + '</b>',
    '▸ ʙɪᴀʏᴀ ʜᴀʀɪᴀɴ ⦂ <code>' + formatIDR(perDay) + '</code>',
    '▸ ᴋᴀᴘᴀsɪᴛᴀs ⦂ <b>10 ɴᴏᴍᴏʀ / ᴋɪʀɪᴍᴀɴ</b>',
    '',
    '♛ <b>ғɪᴛᴜʀ ᴘʀᴇᴍɪᴜᴍ</b>',
    '✦ ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ ᴛᴀɴᴘᴀ ʙᴀᴛᴀs sᴇʟᴀᴍᴀ ᴍᴀsᴀ ᴀᴋᴛɪғ',
    '✦ ʀᴏᴛᴀsɪ ᴘʀᴏxʏ ᴏᴛᴏᴍᴀᴛɪs',
    '✦ ᴀᴋsᴇs ᴘʀᴇᴍɪᴜᴍ ᴅᴇɴɢᴀɴ ʙᴜʟᴋ ᴄʜᴇᴄᴋ',
    '',
    '<i>' + escapeHtml(pkg.highlight) + '</i>',
    '',
    'ᴛᴇᴋᴀɴ ᴛᴏᴍʙᴏʟ ʙᴇʟɪ ᴜɴᴛᴜᴋ ᴍᴇʟɪʜᴀᴛ ᴘᴇᴛᴜɴᴊᴜᴋ ᴘᴇᴍʙᴀʏᴀʀᴀɴ.'
  ].join('\n');
}

function renderPaymentMaintenanceCard({ pkg }) {
  return [
    '▣ <b>ᴋᴏɴғɪʀᴍᴀsɪ ᴘᴇᴍʙᴇʟɪᴀɴ</b>',
    '<i>ᴘᴀsᴛɪᴋᴀɴ ᴅᴇᴛᴀɪʟ ᴘᴀᴋᴇᴛ sᴜᴅᴀʜ sᴇsᴜᴀɪ.</i>',
    '',
    '◈ <b>ʀɪɴᴄɪᴀɴ ᴘᴇsᴀɴᴀɴ</b>',
    '▸ ᴘʀᴏᴅᴜᴋ ⦂ <b>ᴍᴇᴛᴀ ᴅᴇᴛᴇᴄᴛ ᴘʀᴇᴍɪᴜᴍ</b>',
    '▸ ᴅᴜʀᴀsɪ ⦂ <b>' + escapeHtml(pkg.durationLabel) + '</b>',
    '▸ ᴛᴏᴛᴀʟ ʙᴀʏᴀʀ ⦂ <b>' + formatIDR(pkg.price) + '</b>',
    '',
    '⚠️ <b>ᴘᴇᴍʙᴀʏᴀʀᴀɴ ᴏᴛᴏᴍᴀᴛɪs ʙᴇʟᴜᴍ ᴛᴇʀsᴇᴅɪᴀ</b>',
    'ᴜɴᴛᴜᴋ ᴍᴇʟᴀɴᴊᴜᴛᴋᴀɴ ᴘᴇᴍʙᴇʟɪᴀɴ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ᴍᴇʟᴀʟᴜɪ ᴛᴏᴍʙᴏʟ ᴅɪ ʙᴀᴡᴀʜ. ᴀᴋsᴇs ᴀᴋᴀɴ ᴅɪᴀᴋᴛɪғᴋᴀɴ sᴇᴛᴇʟᴀʜ ᴘᴇᴍʙᴀʏᴀʀᴀɴ ᴅɪᴋᴏɴғɪʀᴍᴀsɪ.',
    '',
    '⛨ ᴘᴀsᴛɪᴋᴀɴ ᴘᴇᴍʙᴀʏᴀʀᴀɴ ʜᴀɴʏᴀ ᴅɪʟᴀᴋᴜᴋᴀɴ ᴍᴇʟᴀʟᴜɪ ᴋᴀɴᴀʟ ʀᴇsᴍɪ ᴀᴅᴍɪɴ.'
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
