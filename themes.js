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

function renderDashboard({ user, isVip, isOwner = false, brandName }) {
  const identity = escapeHtml(user.full_name || 'Pengguna');
  const username = user.username && user.username !== '-' ? '@' + escapeHtml(user.username) : 'Tidak tersedia';
  const totalCount = Number(user.total_checks || 0);
  const total = totalCount.toLocaleString('id-ID');
  const access = isOwner ? 'ᴏᴡɴᴇʀ ᴀᴄᴄᴇss' : isVip ? 'ᴘʀᴇᴍɪᴜᴍ' : 'ғʀᴇᴇ ᴍᴇᴍʙᴇʀ';
  const quota = isOwner || isVip
    ? 'ᴛᴀɴᴘᴀ ʙᴀᴛᴀs'
    : Math.max(0, 3 - Number(user.free_used_today || 0)) + ' / 3 ᴛᴇʀsɪsᴀ';
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
    '<blockquote>ᴘɪʟɪʜ ᴍᴇɴᴜ ᴅɪ ʙᴀᴡᴀʜ ᴜɴᴛᴜᴋ ᴍᴜʟᴀɪ ᴍᴇɴᴅᴇᴛᴇᴋsɪ, ᴍᴇʟɪʜᴀᴛ sᴛᴀᴛɪsᴛɪᴋ, ᴀᴛᴀᴜ ᴍᴇɴɢᴜɴᴅᴀɴɢ ᴛᴇᴍᴀɴ.</blockquote>',
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
    '▸ ᴋᴜᴏᴛᴀ ⦂ <b>' + (isVip || isOwner ? 'ᴛᴀɴᴘᴀ ʙᴀᴛᴀs' : remaining + ' / 3 ᴛᴇʀsɪsᴀ') + '</b>',
    '▸ ᴛᴏᴛᴀʟ ⦂ <b>' + Number(user.total_checks || 0).toLocaleString('id-ID') + ' ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ</b>',
    '▸ ᴍᴀsᴀ ᴀᴋᴛɪғ ⦂ <b>' + escapeHtml(expiry) + '</b>',
    '',
    '♧ <b>ᴘʀᴏɢʀᴀᴍ ʀᴇғᴇʀᴀʟ</b>',
    '▸ ᴛᴇᴍᴀɴ ʙᴇʀɢᴀʙᴜɴɢ ⦂ <b>' + Number(referralStats.total || 0).toLocaleString('id-ID') + '</b>',
    '▸ ʜᴀᴅɪᴀʜ ᴅɪᴛᴇʀɪᴍᴀ ⦂ <b>' + Number(referralStats.rewarded || 0) + ' ʜᴀʀɪ ᴘʀᴇᴍɪᴜᴍ</b>',
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
    : '<i>ʙᴇʟᴜᴍ ᴀᴅᴀ ᴅᴀᴛᴀ. ᴊᴀᴅɪʟᴀʜ ᴘᴇɴɢɢᴜɴᴀ ᴘᴇʀᴛᴀᴍᴀ ᴅɪ ᴘᴀᴘᴀɴ ᴘᴇʀɪɴɢᴋᴀᴛ.</i>';

  return [
    '♛ <b>ᴛᴏᴘ 𝟷𝟶 ᴅᴇᴛᴇᴄᴛᴏʀ · ᴍᴇᴛᴀᴅᴇᴛᴇᴄᴛ</b> ♛',
    '',
    lines,
    '',
    '♧ sᴛᴀᴛᴜs ᴅɪ ᴀᴛᴀs ᴀᴅᴀʟᴀʜ ᴜsᴇʀ ʏᴀɴɢ ᴘᴀʟɪɴɢ ᴀᴋᴛɪғ'
  ].join('\n');
}

function renderReferral({ link, stats }) {
  return [
    '♧ <b>ᴘʀᴏɢʀᴀᴍ ʀᴇғᴇʀʀᴀʟ · ᴋᴏɪɴ ʀᴇᴡᴀʀᴅ</b>',
    '<i>ᴜɴᴅᴀɴɢ ᴛᴇᴍᴀɴ · ᴋᴜᴍᴘᴜʟᴋᴀɴ ᴋᴏɪɴ · ᴛᴜᴋᴀʀ ʜᴀᴅɪᴀʜ</i>',
    '',
    '✦ <b>ᴄᴀʀᴀ ᴍᴇɴᴅᴀᴘᴀᴛᴋᴀɴ ᴋᴏɪɴ</b>',
    '① ʙᴀɢɪᴋᴀɴ ᴛᴀᴜᴛᴀɴ ᴜɴᴅᴀɴɢᴀɴᴍᴜ.',
    '② ᴛᴇᴍᴀɴ ʙᴇʀɢᴀʙᴜɴɢ ᴍᴇʟᴀʟᴜɪ ᴛᴀᴜᴛᴀɴ.',
    '③ ᴛᴇᴍᴀɴ ᴍᴇɴʏᴇʟᴇsᴀɪᴋᴀɴ 3 ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ.',
    '④ ᴋᴀᴍᴜ ᴍᴇɴᴅᴀᴘᴀᴛᴋᴀɴ <b>+5 ᴋᴏɪɴ</b>.',
    '',
    '◈ <b>sᴛᴀᴛɪsᴛɪᴋ ʀᴇғᴇʀᴀʟ</b>',
    '▸ ᴛᴇᴍᴀɴ ʙᴇʀɢᴀʙᴜɴɢ ⦂ <b>' + Number(stats.total || 0) + '</b>',
    '▸ ᴜɴᴅᴀɴɢᴀɴ ʙᴇʀʜᴀsɪʟ ⦂ <b>' + Number(stats.rewarded || 0) + '</b>',
    '▸ sᴀʟᴅᴏ ᴋᴏɪɴ ⦂ <b>' + Number(stats.coins || 0) + ' ᴋᴏɪɴ</b>',
    '',
    '⌁ <b>ᴛᴀᴜᴛᴀɴ ᴜɴᴅᴀɴɢᴀɴ ᴘʀɪʙᴀᴅɪ</b>',
    '<code>' + escapeHtml(link) + '</code>',
    '',
    '<blockquote>ᴛᴇᴋᴀɴ ᴛᴏᴍʙᴏʟ ʙᴀɢɪᴋᴀɴ ᴜɴᴛᴜᴋ ᴍᴇɴɢɪʀɪᴍ ᴛᴀᴜᴛᴀɴ ᴋᴇ ᴛᴇᴍᴀɴ. ᴊᴜᴍʟᴀʜ ᴜɴᴅᴀɴɢᴀɴ ᴛɪᴅᴀᴋ ᴅɪʙᴀᴛᴀsɪ.</blockquote>'
  ].join('\n');
}

function renderReferralExchange(stats) {
  return [
    '✦ <b>ᴘᴇɴᴜᴋᴀʀᴀɴ ᴋᴏɪɴ ʀᴇғᴇʀʀᴀʟ</b>',
    '',
    'sᴀʟᴅᴏ ᴋᴏɪɴ ⦂ <b>' + Number(stats.coins || 0) + ' ᴋᴏɪɴ</b>',
    '',
    'ᴘɪʟɪʜ ᴘᴀᴋᴇᴛ ᴀᴋsᴇs ᴅɪ ʙᴀᴡᴀʜ ⦂',
    '▸ 5 ᴋᴏɪɴ ⟿ +10 ᴋᴜᴏᴛᴀ ᴅᴇᴛᴇᴋsɪ',
    '▸ 15 ᴋᴏɪɴ ⟿ ᴘʀᴇᴍɪᴜᴍ 3 ʜᴀʀɪ',
    '▸ 30 ᴋᴏɪɴ ⟿ ᴘʀᴇᴍɪᴜᴍ 7 ʜᴀʀɪ',
    '▸ 100 ᴋᴏɪɴ ⟿ ᴘʀᴇᴍɪᴜᴍ 30 ʜᴀʀɪ',
    '',
    '<blockquote>ᴋᴜᴍᴘᴜʟᴋᴀɴ ᴋᴏɪɴ ᴅᴇɴɢᴀɴ ᴍᴇɴɢᴜɴᴅᴀɴɢ ᴛᴇᴍᴀɴ.</blockquote>'
  ].join('\n');
}

function renderStoreCatalog({ user, packages }) {
  const packageLines = (packages || []).map((pkg, index) => {
    const perDay = Math.round(pkg.price / pkg.duration_days);
    const marker = ['✦', '◈', '✧', '◆', '♛'][index] || '▪';
    return (
      marker + ' <b>' + Number(pkg.duration_days) + ' ʜᴀʀɪ</b> — <b>' + formatIDR(pkg.price) + '</b> · <i>' + toSmallCaps(pkg.tag || '') + '</i>\n' +
      '   <i>sᴇᴛᴀʀᴀ ' + formatIDR(perDay) + ' / ʜᴀʀɪ</i>'
    );
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
    packageLines || '<i>ᴘᴀᴋᴇᴛ ʙᴇʟᴜᴍ ᴛᴇʀsᴇᴅɪᴀ</i>',
    '━━━━━━━━━━━━━━━━━━━━',
    '',
    '<blockquote>ᴘɪʟɪʜ ᴘᴀᴋᴇᴛ ᴍᴇʟᴀʟᴜɪ ᴛᴏᴍʙᴏʟ ᴅɪ ʙᴀᴡᴀʜ. ᴅᴇᴛᴀɪʟ ᴛᴀɢɪʜᴀɴ ᴀᴋᴀɴ ᴍᴜɴᴄᴜʟ sᴇʙᴇʟᴜᴍ ᴘᴇᴍʙᴀʏᴀʀᴀɴ.</blockquote>'
  ].join('\n');
}

function renderPackageDetailCard({ user, pkg }) {
  const perDay = Math.round(pkg.price / pkg.duration_days);
  const days = Number(pkg.duration_days) || 1;
  const paketName = escapeHtml(pkg.durationLabel || (days + ' hari'));
  return [
    '✦ <b>ᴅᴇᴛᴀɪʟ ᴘᴀᴋᴇᴛ ᴘʀᴇᴍɪᴜᴍ</b>',
    'ᴘᴇʀɪᴋsᴀ ʀɪɴᴄɪᴀɴ ᴘᴇsᴀɴᴀɴ sᴇʙᴇʟᴜᴍ ᴍᴇʟᴀɴᴊᴜᴛᴋᴀɴ.',
    '',
    '◈ <b>ʀɪɴᴄɪᴀɴ ᴘᴇsᴀɴᴀɴ</b>',
    '▸ ᴘᴀᴋᴇᴛ ⦂ <b>' + paketName + '</b>',
    '▸ ʜᴀʀɢᴀ ⦂ <b>' + formatIDR(pkg.price) + '</b>',
    '▸ ʙɪᴀʏᴀ ʜᴀʀɪᴀɴ ⦂ <b>' + formatIDR(perDay) + ' / ʜᴀʀɪ</b>',
    '▸ ᴀᴋᴛɪᴠᴀsɪ ⦂ <b>ᴠᴇʀɪꜰɪᴋᴀsɪ ᴍᴀɴᴜᴀʟ</b>',
    '',
    '♛ <b>ꜰɪᴛᴜʀ ᴘʀᴇᴍɪᴜᴍ</b>',
    '· ᴀᴋsᴇs ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ ᴛᴀɴᴘᴀ ʙᴀᴛᴀs sᴇʟᴀᴍᴀ ' + days + ' ʜᴀʀɪ',
    '· ᴍᴀᴋsɪᴍᴀʟ 30 ɴᴏᴍᴏʀ ᴅᴀʟᴀᴍ sᴀᴛᴜ ᴋɪʀɪᴍᴀɴ',
    '· ʟᴀᴘᴏʀᴀɴ ʜᴀsɪʟ ᴛᴇʀᴋᴀᴛᴇɢᴏʀɪ & ʀᴏᴛᴀsɪ ᴘʀᴏxʏ',
    '',
    'ᴛᴇᴋᴀɴ ᴛᴏᴍʙᴏʟ ʙᴇʟɪ ᴅɪ ʙᴀᴡᴀʜ ᴜɴᴛᴜᴋ ᴍᴇʟɪʜᴀᴛ ɪɴsᴛʀᴜᴋsɪ ᴘᴇᴍʙᴀʏᴀʀᴀɴ.'
  ].join('\n');
}

function renderPaymentMaintenanceCard({ user, pkg }) {
  return [
    '▣ <b>ᴋᴏɴғɪʀᴍᴀsɪ ᴘᴇᴍʙᴇʟɪᴀɴ</b>',
    '<i>ᴘᴀsᴛɪᴋᴀɴ ᴅᴇᴛᴀɪʟ ᴘᴀᴋᴇᴛ sᴜᴅᴀʜ sᴇsᴜᴀɪ.</i>',
    '',
    '◈ <b>ʀɪɴᴄɪᴀɴ ᴘᴇsᴀɴᴀɴ</b>',
    '▸ ᴘʀᴏᴅᴜᴋ ⦂ <b>ᴍᴇᴛᴀ ᴅᴇᴛᴇᴄᴛ ᴘʀᴇᴍɪᴜᴍ</b>',
    '▸ ᴅᴜʀᴀsɪ ⦂ <b>' + escapeHtml(pkg.durationLabel) + '</b>',
    '▸ ᴛᴏᴛᴀʟ ʙᴀʏᴀʀ ⦂ <b>' + formatIDR(pkg.price) + '</b>',
    '',
    '<blockquote>ᴘᴇᴍʙᴀʏᴀʀᴀɴ ᴏᴛᴏᴍᴀᴛɪs ʙᴇʟᴜᴍ ᴛᴇʀsᴇᴅɪᴀ. sɪʟᴀᴋᴀɴ ᴋᴇᴍʙᴀʟɪ ᴋᴇ ᴋᴀᴛᴀʟᴏɢ ᴘᴀᴋᴇᴛ ᴀᴛᴀᴜ ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ.</blockquote>',
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
    ...(groups.smsUnavailable.length ? ['', '⊘ <b>ᴏᴘsɪ sᴍs ᴛɪᴅᴀᴋ ᴅɪᴛᴇᴍᴜᴋᴀɴ</b>', ...groups.smsUnavailable] : []),
    ...(groups.restricted.length ? ['', '✕ <b>ᴅɪʙᴀᴛᴀsɪ</b>', ...groups.restricted] : []),
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
    '▸ ᴊᴀʟᴜʀ ⦂ <code>' + escapeHtml conf.result.proxyInfo) + '</code>',
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
