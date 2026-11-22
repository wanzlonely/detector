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
    '✦ <b>' + escapeHtml(brandName || 'META DETECT') + '</b> ✦',
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
    '▸ ᴛᴇᴍᴀɴ ʙᴇʀɢᴀʙᴜɴɢ ⦂ <b>' + Number((referralStats && referralStats.total) || 0).toLocaleString('id-ID') + '</b>',
    '▸ ʜᴀᴅɪᴀʜ ᴅɪᴛᴇʀɪᴍᴀ ⦂ <b>' + Number((referralStats && referralStats.rewarded) || 0) + ' ʜᴀʀɪ ᴘʀᴇᴍɪᴜᴍ</b>',
    '',
    '◈ sɪsᴛᴇᴍ ᴀᴋᴛɪꜰ'
  ].join('\n');
}

function renderLeaderboard(rows) {
  const medals = ['♛', '♜', '♞'];
  const lines = (rows && rows.length)
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
  const coins = (stats && stats.coins) || 0;
  const invited = (stats && (stats.total || stats.invited)) || 0;
  return [
    '♧ <b>ʀᴇғᴇʀʀᴀʟ</b>',
    '',
    '▸ ᴋᴏɪɴ ⦂ <b>' + coins + '</b>',
    '▸ ᴛᴇʀᴜɴᴅᴀɴɢ ⦂ <b>' + invited + '</b>',
    '',
    '<blockquote>ʙᴀɢɪᴋᴀɴ ᴛᴀᴜᴛᴀɴ ᴅɪ ʙᴀᴡᴀʜ. sᴇᴛɪᴀᴘ ʀᴇғᴇʀʀᴀʟ ʏᴀɴɢ ᴍᴇɴʏᴇʟᴇsᴀɪᴋᴀɴ 3 ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ ᴍᴇᴍʙᴇʀɪᴋᴀɴ 5 ᴋᴏɪɴ.</blockquote>',
    '',
    '<code>' + escapeHtml(link) + '</code>'
  ].join('\n');
}

function renderReferralExchange() {
  return [
    '◈ <b>ᴛᴜᴋᴀʀ ᴋᴏɪɴ</b>',
    '',
    '<blockquote>ғɪᴛᴜʀ ᴘᴇɴᴜᴋᴀʀᴀɴ ᴋᴏɪɴ ᴀᴋᴀɴ sᴇɢᴇʀᴀ ᴛᴇʀsᴇᴅɪᴀ.</blockquote>'
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
  const tag = pkg.tag ? String(pkg.tag).toUpperCase() + ' ' : '';
  const paketName = escapeHtml(tag + (pkg.durationLabel || (days + ' Hari')));
  const aksesDurasi = days === 1 ? '24 ᴊᴀᴍ' : (days + ' ʜᴀʀɪ');
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
    '· ᴀᴋsᴇs ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ ᴛᴀɴᴘᴀ ʙᴀᴛᴀs sᴇʟᴀᴍᴀ ' + aksesDurasi,
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

function renderDetectionSummary() { return ''; }
function renderCooldownCard() { return ''; }

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
