function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatIDR(n) {
  const num = Number(n) || 0;
  return 'Rp ' + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatDateWIB(ts) {
  if (!ts) return '-';
  const d = new Date((Number(ts) || 0) * 1000);
  return d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
}

function renderDashboard({ user, isVip, isOwner, brandName }) {
  const name = escapeHtml(user.full_name || user.username || 'User');
  const plan = isOwner ? 'OWNER' : (isVip ? (user.vip_plan || 'PREMIUM') : 'FREE');
  const until = isVip && user.vip_until ? formatDateWIB(user.vip_until) : '-';
  return [
    '✦ <b>' + escapeHtml(brandName || 'META DETECT') + '</b>',
    '',
    '▸ ᴘᴇɴɢɢᴜɴᴀ ⦂ <b>' + name + '</b>',
    '▸ ᴘʟᴀɴ ⦂ <b>' + escapeHtml(plan) + '</b>',
    isVip ? ('▸ ᴀᴋᴛɪꜰ ʜɪɴɢɢᴀ ⦂ <b>' + until + '</b>') : '▸ ᴋᴜᴏᴛᴀ ɢʀᴀᴛɪs ⦂ <b>3 / ʜᴀʀɪ</b>',
    '',
    '<blockquote>ᴘɪʟɪʜ ᴍᴇɴᴜ ᴅɪ ʙᴀᴡᴀʜ ᴜɴᴛᴜᴋ ᴍᴇᴍᴜʟᴀɪ.</blockquote>'
  ].join('\n');
}

function renderStatus({ user, isVip, isOwner, referralStats }) {
  const name = escapeHtml(user.full_name || user.username || 'User');
  const plan = isOwner ? 'OWNER' : (isVip ? (user.vip_plan || 'PREMIUM') : 'FREE');
  const until = isVip && user.vip_until ? formatDateWIB(user.vip_until) : '-';
  const checks = Number(user.total_checks || 0);
  const coins = (referralStats && referralStats.coins) || 0;
  return [
    '◈ <b>sᴛᴀᴛᴜs ᴀᴋᴜɴ</b>',
    '',
    '▸ ɴᴀᴍᴀ ⦂ <b>' + name + '</b>',
    '▸ ᴘʟᴀɴ ⦂ <b>' + escapeHtml(plan) + '</b>',
    isVip ? ('▸ ᴀᴋᴛɪꜰ ʜɪɴɢɢᴀ ⦂ <b>' + until + '</b>') : '▸ ᴋᴜᴏᴛᴀ ʜᴀʀɪ ɪɴɪ ⦂ <b>' + Math.max(0, 3 - Number(user.free_used_today || 0)) + ' / 3</b>',
    '▸ ᴛᴏᴛᴀʟ ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ ⦂ <b>' + checks + '</b>',
    '▸ ᴋᴏɪɴ ʀᴇғᴇʀʀᴀʟ ⦂ <b>' + coins + '</b>'
  ].join('\n');
}

function renderLeaderboard(rows) {
  const lines = ['♛ <b>ʟᴇᴀᴅᴇʀʙᴏᴀʀᴅ</b>', ''];
  if (!rows || !rows.length) {
    lines.push('<i>ʙᴇʟᴜᴍ ᴀᴅᴀ ᴅᴀᴛᴀ.</i>');
  } else {
    rows.forEach((r, i) => {
      const name = escapeHtml(r.full_name || r.username || 'User');
      lines.push((i + 1) + '. <b>' + name + '</b> · ' + (r.total_checks || 0) + ' ᴄᴇᴋ');
    });
  }
  return lines.join('\n');
}

function renderReferral({ link, stats }) {
  const coins = (stats && stats.coins) || 0;
  const invited = (stats && stats.invited) || 0;
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
  const lines = packages.map((p) => {
    const tag = p.tag ? '[' + p.tag + '] ' : '';
    return '· ' + tag + escapeHtml(p.durationLabel) + ' — <b>' + formatIDR(p.price) + '</b>';
  }).join('\n');
  return [
    '✧ <b>ᴋᴀᴛᴀʟᴏɢ ᴘʀᴇᴍɪᴜᴍ</b>',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    lines || '<i>ᴘᴀᴋᴇᴛ ʙᴇʟᴜᴍ ᴛᴇʀsᴇᴅɪᴀ</i>',
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

function renderDetectionSummary({ results, elapsedSeconds }) {
  return '✦ <b>ʀɪɴɢᴋᴀsᴀɴ</b>';
}

function renderCooldownCard() {
  return '◐ <b>ᴄᴏᴏʟᴅᴏᴡɴ</b>';
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
