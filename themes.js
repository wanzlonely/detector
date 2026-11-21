function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const VARIANT_PREFIX = {
  primary: '⌖ ',
  success: '✓ ',
  danger: '⛨ '
};

function btn(text, callback_data, variant = null) {
  const prefix = VARIANT_PREFIX[variant] || '';
  return { text: `${prefix}${text}`, callback_data };
}

function formatIDR(num) {
  return 'Rp ' + Number(num).toLocaleString('id-ID');
}
function toSmallCaps(value) {
  const map = {a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'s',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ'};
  return String(value).toLowerCase().replace(/[a-z]/g, (char) => map[char] || char);
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
    '♧ <b>ᴘʀᴏɢʀᴀᴍ ʀᴇғᴇʀᴀʟ</b>',
    '▸ ᴛᴇᴍᴀɴ ʙᴇʀɢᴀʙᴜɴɢ ⦂ <b>' + Number(referralStats.total || 0).toLocaleString('id-ID') + '</b>',
    '▸ ʜᴀᴅɪᴀʜ ᴅɪᴛᴇʀɪᴍᴀ ⦂ <b>' + Number(referralStats.rewarded || 0) + ' ʜᴀʀɪ ᴘʀᴇᴍɪᴜᴍ</b>',
    '',
    '⌁ ᴛᴇʀᴜs ɢᴜɴᴀᴋᴀɴ ᴍᴇᴛᴀ ᴅᴇᴛᴇᴄᴛ ᴜɴᴛᴜᴋ ᴍᴇɴɪɴɢᴋᴀᴛᴋᴀɴ ᴀᴋᴛɪᴠɪᴛᴀs ᴀᴋᴜɴᴍᴜ.',
    '',
    '◈ sɪsᴛᴇᴍ ᴀᴋᴛɪꜰ'
  ].join('\n');
}

function renderLeaderboard(rows) {
  const medals = ['♛', '♜', '♞'];
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
    '♛ <b>ᴛᴏᴘ 𝟷𝟶 ᴅᴇᴛᴇᴄᴛᴏʀ • ᴍᴇᴛᴀᴅᴇᴛᴇᴄᴛ</b> ♛',
    '',
    lines,
    '',
    '♧ sᴛᴀᴛᴜs ᴅɪ ᴀᴛᴀs ᴀᴅᴀʟᴀʜ ᴜsᴇʀ ʏᴀɴɢ ᴘᴀʟɪɴɢ ɢᴏᴋɪʟ '
  ].join('\n');
}function renderReferral({ link, stats }) {
  return [
    '♧ <b>ᴘʀᴏɢʀᴀᴍ ʀᴇғᴇʀʀᴀʟ · ᴋᴏɪɴ ʀᴇᴡᴀʀᴅ</b>',
    '<i>ᴜɴᴅᴀɴɢ ᴛᴇᴍᴀɴ · ᴋᴜᴍᴘᴜʟᴋᴀɴ ᴋᴏɪɴ · ᴛᴜᴋᴀʀ ʜᴀᴅɪᴀʜ</i>','',
    '✦ <b>ᴄᴀʀᴀ ᴍᴇɴᴅᴀᴘᴀᴛᴋᴀɴ ᴋᴏɪɴ</b>',
    '① ʙᴀɢɪᴋᴀɴ ᴛᴀᴜᴛᴀɴ ᴜɴᴅᴀɴɢᴀɴᴍᴜ.','② ᴛᴇᴍᴀɴ ʙᴇʀɢᴀʙᴜɴɢ ᴍᴇʟᴀʟᴜɪ ᴛᴀᴜᴛᴀɴ.',
    '③ ᴛᴇᴍᴀɴ ᴍᴇɴʏᴇʟᴇsᴀɪᴋᴀɴ 3 ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ.','④ ᴋᴀᴍᴜ ᴍᴇɴᴅᴀᴘᴀᴛᴋᴀɴ <b>+5 ᴋᴏɪɴ</b>.','',
    '◈ <b>sᴛᴀᴛɪsᴛɪᴋ ʀᴇғᴇʀᴀʟ</b>',
    '▸ ᴛᴇᴍᴀɴ ʙᴇʀɢᴀʙᴜɴɢ ⦂ <b>'+Number(stats.total||0)+'</b>',
    '▸ ᴜɴᴅᴀɴɢᴀɴ ʙᴇʀʜᴀsɪʟ ⦂ <b>'+Number(stats.rewarded||0)+'</b>',
    '▸ sᴀʟᴅᴏ ᴋᴏɪɴ ⦂ <b>'+Number(stats.coins||0)+' ᴋᴏɪɴ</b>','',
    '⌁ <b>ᴛᴀᴜᴛᴀɴ ᴜɴᴅᴀɴɢᴀɴ ᴘʀɪʙᴀᴅɪ</b>','<code>'+escapeHtml(link)+'</code>',
    'ᴛᴇᴋᴀɴ ᴛᴏᴍʙᴏʟ ʙᴀɢɪᴋᴀɴ ᴜɴᴛᴜᴋ ᴍᴇɴɢɪʀɪᴍ ᴛᴀᴜᴛᴀɴ ᴋᴇ ᴛᴇᴍᴀɴ.','',
    'ᴊᴜᴍʟᴀʜ ᴜɴᴅᴀɴɢᴀɴ ᴛɪᴅᴀᴋ ᴅɪʙᴀᴛᴀsɪ.'
  ].join('\n');
}
function renderReferralExchange(stats) {
  return ['✦ <b>ᴘᴇɴᴜᴋᴀʀᴀɴ ᴋᴏɪɴ ʀᴇғᴇʀʀᴀʟ</b>','',
    'sᴀʟᴅᴏ ᴋᴏɪɴ ⦂ <b>'+Number(stats.coins||0)+' ᴋᴏɪɴ</b>','',
    'ᴘɪʟɪʜ ᴘᴀᴋᴇᴛ ᴀᴋsᴇs ᴅɪ ʙᴀᴡᴀʜ ⦂',
    '▸ 5 ᴋᴏɪɴ ⟿ +10 ᴋᴜᴏᴛᴀ ᴅᴇᴛᴇᴋsɪ','▸ 15 ᴋᴏɪɴ ⟿ ᴘʀᴇᴍɪᴜᴍ 3 ʜᴀʀɪ',
    '▸ 30 ᴋᴏɪɴ ⟿ ᴘʀᴇᴍɪᴜᴍ 7 ʜᴀʀɪ','▸ 100 ᴋᴏɪɴ ⟿ ᴘʀᴇᴍɪᴜᴍ 30 ʜᴀʀɪ','',
    'ᴋᴜᴍᴘᴜʟᴋᴀɴ ᴋᴏɪɴ ᴅᴇɴɢᴀɴ ᴍᴇɴɢᴜɴᴅᴀɴɢ ᴛᴇᴍᴀɴ.'
  ].join('\n');
}

function renderStoreCatalog({ packages }) {
  const packageLines = packages.map((pkg, index) => {
    const perDay = Math.round(pkg.price / pkg.duration_days);
    const marker = ['✦', '◈', '✧', '◆', '♛'][index] || '▪';
    return marker + ' <b>' + Number(pkg.duration_days) + ' ʜᴀʀɪ</b> — <b>' + formatIDR(pkg.price) + '</b> · <i>' + toSmallCaps(pkg.tag) + '</i>\n   <i>sᴇᴛᴀʀᴀ ' + formatIDR(perDay) + ' / ʜᴀʀɪ</i>';
  }).join('\n\n');
  return [
    '✦ <b>ᴍᴇᴛᴀ ᴅᴇᴛᴇᴄᴛ · ᴘʀᴇᴍɪᴜᴍ</b>',
    'ᴀᴋsᴇs ᴘʀᴇᴍɪᴜᴍ ᴜɴᴛᴜᴋ ᴘᴇɴɢɢᴜɴᴀᴀɴ ʟᴇʙɪʜ ʟᴇʟᴜᴀsᴀ.',
    '',
    '♛ <b>ᴋᴇᴜɴɢɢᴜʟᴀɴ ᴘʀᴇᴍɪᴜᴍ</b>',
    '· ᴋᴜᴏᴛᴀ ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ ᴍᴇɴɢɪᴋᴜᴛɪ ᴘᴀᴋᴇᴛ ʏᴀɴɢ ᴀᴋᴛɪғ',
    '· ʜᴀsɪʟ ᴅɪᴛᴀᴍᴘɪʟᴋᴀɴ ᴅᴇɴɢᴀɴ ᴋᴀᴛᴇɢᴏʀɪ sᴛᴀᴛᴜs ʏᴀɴɢ ᴊᴇʟᴀs',
    '· ᴀᴋsᴇs ғɪᴛᴜʀ ᴘʀᴇᴍɪᴜᴍ sᴇʟᴀᴍᴀ ᴍᴀsᴀ ᴀᴋᴛɪғ',
    '',
    '▤ <b>ᴘɪʟɪʜ ᴅᴜʀᴀsɪ ᴘᴀᴋᴇᴛ</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    packageLines,
    '━━━━━━━━━━━━━━━━━━━━',
    '',
    'ᴘɪʟɪʜ ᴘᴀᴋᴇᴛ ᴍᴇʟᴀʟᴜɪ ᴛᴏᴍʙᴏʟ ᴅɪ ʙᴀᴡᴀʜ. ᴅᴇᴛᴀɪʟ ᴛᴀɢɪʜᴀɴ ᴀᴋᴀɴ ᴍᴜɴᴄᴜʟ sᴇʙᴇʟᴜᴍ ᴘᴇᴍʙᴀʏᴀʀᴀɴ.'
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
    '▸ ᴍᴇᴛᴏᴅᴇ ⦂ <b>ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ ᴍᴀɴᴜᴀʟ</b>',
    '',
    '♛ <b>ғɪᴛᴜʀ ᴘʀᴇᴍɪᴜᴍ</b>',
    '✦ ᴋᴜᴏᴛᴀ ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ ᴍᴇɴɢɪᴋᴜᴛɪ ᴘᴀᴋᴇᴛ',
    '✦ ᴛᴀᴍᴘɪʟᴀɴ ʜᴀsɪʟ ᴅᴇɴɢᴀɴ ᴋᴀᴛᴇɢᴏʀɪ sᴛᴀᴛᴜs',
    '✦ ᴀᴋsᴇs ғɪᴛᴜʀ ᴘʀᴇᴍɪᴜᴍ sᴇʟᴀᴍᴀ ᴍᴀsᴀ ᴀᴋᴛɪғ',
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
    'ᴘᴇᴍʙᴀʏᴀʀᴀɴ ʙᴇʟᴜᴍ ᴀᴋᴛɪғ. sɪʟᴀᴋᴀɴ ᴋᴇᴍʙᴀʟɪ ᴋᴇ ᴋᴀᴛᴀʟᴏɢ ᴘᴀᴋᴇᴛ ᴜɴᴛᴜᴋ ᴍᴇʟɪʜᴀᴛ ᴘɪʟɪʜᴀɴ ʟᴀɪɴ.',
    '',
    '⛨ ᴘᴀsᴛɪᴋᴀɴ ᴘᴇᴍʙᴀʏᴀʀᴀɴ ʜᴀɴʏᴀ ᴅɪʟᴀᴋᴜᴋᴀɴ ᴍᴇʟᴀʟᴜɪ ᴋᴀɴᴀʟ ʀᴇsᴍɪ ᴀᴅᴍɪɴ.'
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
      groups.cooldown.push(number + (timer ? ' — ' + escapeHtml(timer) : ''));
    } else if (item.result.isReady) groups.ready.push(number);
    else if (item.result.smsAvailable === false) groups.smsUnavailable.push(number);
    else groups.failed.push(number);
  }
  return [
    '⌖ <b>ʜᴀsɪʟ ᴅᴇᴛᴇᴋsɪ</b>',
    ...(groups.ready.length ? ['', '✓ <b>sɪᴀᴘ ᴅɪᴠᴇʀɪғɪᴋᴀsɪ</b>', ...groups.ready] : []),
    ...(groups.cooldown.length ? ['', '◐ <b>ᴄᴏᴏʟᴅᴏᴡɴ ᴡʜᴀᴛsᴀᴘᴘ</b>', ...groups.cooldown] : []),
    ...(groups.clone.length ? ['', '△ <b>ᴛɪᴅᴀᴋ sᴜᴘᴘᴏʀᴛ ᴄʟᴏɴᴇ</b>', ...groups.clone] : []),
    ...(groups.smsUnavailable.length ? ['', '✕ <b>ᴏᴘsɪ sᴍs ᴛɪᴅᴀᴋ ᴅɪᴛᴇᴍᴜᴋᴀɴ</b>', ...groups.smsUnavailable] : []),
    ...(groups.restricted.length ? ['', '⊘ <b>ᴅɪʙᴀᴛᴀsɪ</b>', ...groups.restricted] : []),
    ...(groups.failed.length ? ['', '⚠ <b>ɢᴀɢᴀʟ ᴅɪᴘʀᴏsᴇs</b>', ...groups.failed] : []),
    '',
    'ᴘʀᴏsᴇs ⟿ ' + Math.max(0, Number(elapsedSeconds) || 0) + 'd'
  ].join('\n');
}

function renderCooldownCard({ result, user, isVip }) {
  const remaining = Math.max(0, 3 - Number(user.free_used_today || 0));
  const numberDisplay = formatSensitiveNumber(result.formattedNumber, Boolean(user.privacy_mode));
  const sms = result.channels.sms;
  const status = result.isBanned ? 'ᴅɪʙʟᴏᴋɪʀ' : result.anyCooldown ? 'ᴄᴏᴏʟᴅᴏᴡɴ ᴀᴋᴛɪғ' : 'sɪᴀᴘ';
  const verdict = result.isBanned
    ? 'ɴᴏᴍᴏʀ ᴛᴇʀᴅᴇᴛᴇᴋsɪ ᴍᴇᴍɪʟɪᴋɪ ᴘᴇᴍʙᴀᴛᴀsᴀɴ ᴅᴀʀɪ ʟᴀʏᴀɴᴀɴ ᴡʜᴀᴛsᴀᴘᴘ.'
    : result.anyCooldown
      ? 'ɴᴏᴍᴏʀ ᴍᴀsɪʜ ʙᴇʀᴀᴅᴀ ᴅᴀʟᴀᴍ ᴍᴀsᴀ ᴛᴜɴɢɢᴜ ᴠᴇʀɪғɪᴋᴀsɪ.'
      : 'ᴛɪᴅᴀᴋ ᴅɪᴛᴇᴍᴜᴋᴀɴ ᴍᴀsᴀ ᴛᴜɴɢɢᴜ ᴀᴋᴛɪғ ᴘᴀᴅᴀ ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ ɪɴɪ.';
  const access = String(user.vip_tier).toUpperCase() === 'OWNER'
    ? '♛ ᴏᴡɴᴇʀ ᴀᴄᴄᴇss'
    : !isVip ? 'ғʀᴇᴇ · ' + remaining + '/3' : '✦ ᴘʀᴇᴍɪᴜᴍ ᴀᴄᴄᴇss';
  return [
    '✦ <b>ʜᴀsɪʟ ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ</b> ✦',
    '<i>ᴀɴᴀʟɪsɪs sᴛᴀᴛᴜs ɴᴏᴍᴏʀ ᴡʜᴀᴛsᴀᴘᴘ</i>',
    '',
    '◈ <b>ɪɴғᴏʀᴍᴀsɪ ᴛᴀʀɢᴇᴛ</b>',
    '▸ ɴᴏᴍᴏʀ ⦂ ' + numberDisplay,
    '▸ ɴᴇɢᴀʀᴀ ⦂ <b>' + escapeHtml(result.region) + '</b>',
    '▸ sᴛᴀᴛᴜs ⦂ <b>' + status + '</b>',
    '▸ ᴊᴀʟᴜʀ ⦂ <code>' + escapeHtml(result.proxyInfo) + '</code>',
    '',
    '⌁ <b>ʜᴀsɪʟ ᴀɴᴀʟɪsɪs</b>',
    verdict,
    '',
    '⚙ <b>ᴠᴇʀɪғɪᴋᴀsɪ sᴍs</b>',
    '▸ ᴍᴀsᴀ ᴛᴜɴɢɢᴜ ⦂ <b>' + (sms.isCooldown ? escapeHtml(sms.uiTimer) : 'ᴛɪᴅᴀᴋ ᴀᴋᴛɪғ') + '</b>',
    '▸ ᴅᴜʀᴀsɪ ⦂ <code>' + (sms.isCooldown ? escapeHtml(sms.humanTime) : 'ʀᴇᴀᴅʏ') + '</code>',
    '',
    '◈ ' + formatDateWIB(Math.floor(Date.now() / 1000)) + ' · ' + access
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
  renderReferralExchange,
  renderStoreCatalog,
  renderPackageDetailCard,
  renderPaymentMaintenanceCard,
  renderCooldownCard,
  renderDetectionSummary
};
