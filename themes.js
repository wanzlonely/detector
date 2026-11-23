function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  const level = isOwner ? 'ᴏᴡɴᴇʀ' : isVip ? 'ᴘʀᴇᴍɪᴜᴍ' : totalCount >= 100 ? 'ᴀᴄᴛɪᴠᴇ' : 'ʀᴇɢᴜʟᴀʀ';

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

function renderLeaderboard(rows, myRank) {
  const medals = ['♛', '♜', '♝', '♞', '♟', '♙', '♘', '♗', '♖', '♕'];
  const lines = (rows && rows.length)
    ? rows.slice(0, 10).map((row, index) => {
        const rank = String(index + 1).padStart(2, '0');
        const medal = medals[index] || '•';
        const name = escapeHtml(row.full_name || 'Pengguna');
        const count = Number(row.total_checks || 0).toLocaleString('id-ID');
        return medal + ' ' + rank + ' · <b>' + name + '</b>\n      └ <b>' + count + '</b> ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ';
      }).join('\n\n')
    : '<i>ʙᴇʟᴜᴍ ᴀᴅᴀ ᴅᴀᴛᴀ. ᴊᴀᴅɪʟᴀʜ ᴘᴇɴɢɢᴜɴᴀ ᴘᴇʀᴛᴀᴍᴀ ᴅɪ ᴘᴀᴘᴀɴ ᴘᴇʀɪɴɢᴋᴀᴛ.</i>';

  const rankText = (myRank && myRank > 0)
    ? String(myRank)
    : '—';

  return [
    '✦ <b>ᴛᴏᴘ 10 ᴅᴇᴛᴇᴄᴛᴏʀ · ᴍᴇᴛᴀᴅᴇᴛᴇᴄᴛ</b>',
    '──────────────────────',
    lines,
    '──────────────────────',
    '⌖ ᴘᴇʀɪɴɢᴋᴀᴛ ᴋᴀᴍᴜ ⦂ <b>' + rankText + '</b>',
    'ⓘ ᴅɪᴘᴇʀʙᴀʀᴜɪ ʀᴇᴀʟ-ᴛɪᴍᴇ ʙᴇʀᴅᴀsᴀʀᴋᴀɴ ᴛᴏᴛᴀʟ ᴄᴇᴋ'
  ].join('\n');
}

function renderReferral({ link, stats }) {
  const coins = (stats && stats.coins) || 0;
  const invited = (stats && (stats.total || stats.invited)) || 0;
  const rewarded = (stats && stats.rewarded) || 0;
  return [
    '♧ <b>ᴘʀᴏɢʀᴀᴍ ʀᴇғᴇʀʀᴀʟ</b> ♧',
    '<i>ᴜɴᴅᴀɴɢ ᴛᴇᴍᴀɴ · ᴅᴀᴘᴀᴛᴋᴀɴ ᴋᴏɪɴ</i>',
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '▸ ᴋᴏɪɴ ᴋᴀᴍᴜ ⦂ <b>' + coins + '</b>',
    '▸ ᴛᴇᴍᴀɴ ᴛᴇʀᴜɴᴅᴀɴɢ ⦂ <b>' + invited + '</b>',
    '▸ ʜᴀᴅɪᴀʜ ᴅɪᴋʟᴀɪᴍ ⦂ <b>' + rewarded + '</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    '',
    '♛ <b>ᴄᴀʀᴀ ᴋᴇʀᴊᴀ</b>',
    '1. ʙᴀɢɪᴋᴀɴ ᴛᴀᴜᴛᴀɴ ᴜɴᴅᴀɴɢᴀɴ ᴋᴀᴍᴜ',
    '2. ᴛᴇᴍᴀɴ ʙᴇʀɢᴀʙᴜɴɢ ʟᴇᴡᴀᴛ ᴛᴀᴜᴛᴀɴ',
    '3. ᴛᴇᴍᴀɴ sᴇʟᴇsᴀɪᴋᴀɴ <b>3 ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ</b>',
    '4. ᴋᴀᴍᴜ ᴅᴀᴘᴀᴛ <b>5 ᴋᴏɪɴ</b> ᴏᴛᴏᴍᴀᴛɪs',
    '',
    '◈ <b>ᴛᴀᴜᴛᴀɴ ᴜɴᴅᴀɴɢᴀɴ</b>',
    '<code>' + escapeHtml(link) + '</code>',
    '',
    '<blockquote>ᴋᴏɪɴ ʙɪsᴀ ᴅɪᴛᴜᴋᴀʀ ᴍᴇɴᴊᴀᴅɪ ᴋᴜᴏᴛᴀ ᴛᴀᴍʙᴀʜᴀɴ ᴀᴛᴀᴜ ᴀᴋsᴇs ᴘʀᴇᴍɪᴜᴍ.</blockquote>'
  ].join('\n');
}

function renderReferralExchange(stats) {
  const coins = Number((stats && stats.coins) || 0);
  return [
    '◈ <b>ᴛᴜᴋᴀʀ ᴋᴏɪɴ ʀᴇғᴇʀʀᴀʟ</b>',
    '<i>ᴛᴜᴋᴀʀ ᴋᴏɪɴ ᴍᴇɴᴊᴀᴅɪ ᴋᴜᴏᴛᴀ ᴀᴛᴀᴜ ᴘʀᴇᴍɪᴜᴍ</i>',
    '',
    '──────────────────────',
    '▸ sᴀʟᴅᴏ ᴋᴏɪɴ ⦂ <b>' + coins + '</b>',
    '──────────────────────',
    '',
    '♛ <b>ᴘᴀᴋᴇᴛ ᴘᴇɴᴜᴋᴀʀᴀɴ</b>',
    '',
    '✧ <b>3 ᴋᴜᴏᴛᴀ ᴄᴇᴋ</b> — 10 ᴋᴏɪɴ',
    '   └ ᴛᴀᴍʙᴀʜᴀɴ ᴋᴜᴏᴛᴀ ɢʀᴀᴛɪs (ᴀᴋᴜɴ ғʀᴇᴇ)',
    '',
    '✧ <b>1 ʜᴀʀɪ ᴘʀᴇᴍɪᴜᴍ</b> — 25 ᴋᴏɪɴ',
    '   └ ᴀᴋsᴇs ᴘᴇɴᴜʜ 24 ᴊᴀᴍ',
    '',
    '✧ <b>3 ʜᴀʀɪ ᴘʀᴇᴍɪᴜᴍ</b> — 50 ᴋᴏɪɴ',
    '   └ ᴀᴋsᴇs ᴘᴇɴᴜʜ 3 × 24 ᴊᴀᴍ',
    '',
    '✧ <b>7 ʜᴀʀɪ ᴘʀᴇᴍɪᴜᴍ</b> — 100 ᴋᴏɪɴ',
    '   └ ᴀᴋsᴇs ᴘᴇɴᴜʜ 7 ʜᴀʀɪ',
    '',
    '──────────────────────',
    '<blockquote>1 ʀᴇғᴇʀʀᴀʟ sᴜᴋsᴇs = 5 ᴋᴏɪɴ (sᴇᴛᴇʟᴀʜ ᴛᴇᴍᴀɴ sᴇʟᴇsᴀɪ 3 ᴄᴇᴋ).</blockquote>',
    'ᴘɪʟɪʜ ᴘᴀᴋᴇᴛ ᴅɪ ʙᴀᴡᴀʜ ᴜɴᴛᴜᴋ ᴍᴇɴᴜᴋᴀʀ.'
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

function renderAccountDetail(r) {
  if (!r) return '✕ ᴅᴀᴛᴀ ᴛɪᴅᴀᴋ ᴅɪᴛᴇᴍᴜᴋᴀɴ';
  const num = r.formattedNumber || '-';
  const st = r.accountStatus || '-';
  const dev = r.deviceName || (r.waOldEligible ? 'ᴛᴇʀᴅᴀғᴛᴀʀ' : '-');
  const email = r.maskedEmail || '-';

  const methods = [].concat(r.recommendedMethods || [], r.fallbackMethods || []);
  const methodStr = methods.length ? methods.slice(0, 6).join(', ') : '-';

  const ch = r.channels || {};
  const formatSecs = (sec) => {
    if (!sec || sec <= 0) return 'ᴛᴇʀʙᴜᴋᴀ';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const h = Math.floor(sec / 3600);
    if (h > 0) return h + 'j ' + m + 'm ' + s + 's';
    if (m > 0) return m + 'm ' + s + 's';
    return s + 's';
  };

  const chLine = (name, c) => {
    if (!c) return name + ' ⦂ -';
    const sec = Number(c.rawSeconds || 0);
    return name + ' ⦂ ' + formatSecs(sec);
  };

  const lines = [
    '◈ <b>ᴅᴇᴛᴀɪʟ ᴀᴋᴜɴ</b>',
    '──────────────────────',
    '▸ ɴᴏᴍᴏʀ ⦂ <code>' + num + '</code>',
    '▸ sᴛᴀᴛᴜs ⦂ <b>' + st + '</b>',
    '▸ sᴋᴏʀ ⦂ <b>' + (r.qualityScore != null ? r.qualityScore : '-') + '/100</b>',
    '▸ ᴘᴇʀᴀɴɢᴋᴀᴛ ⦂ <b>' + escapeHtml(String(dev)) + '</b>',
    '▸ ᴇᴍᴀɪʟ ⦂ <b>' + escapeHtml(String(email)) + '</b>',
    '▸ 2ғᴀ ᴘᴀssᴡᴏʀᴅ ⦂ <b>' + (r.hasPassword ? 'ᴀᴋᴛɪғ' : 'ᴛɪᴅᴀᴋ') + '</b>',
    '▸ ᴘᴀssᴋᴇʏ ⦂ <b>' + (r.hasPasskey ? 'ᴀᴋᴛɪғ' : 'ᴛɪᴅᴀᴋ') + '</b>',
    '▸ ʜɪɢʜ ʀᴇ-ʀᴇɢ ⦂ <b>' + (r.highRereg ? 'ʏᴀ' : 'ᴛɪᴅᴀᴋ') + '</b>',
    '──────────────────────',
    '♛ <b>ᴄʜᴀɴɴᴇʟ ᴏᴛᴘ</b>',
    '▸ ' + chLine('sᴍs', ch.sms),
    '▸ ' + chLine('ᴠᴏɪᴄᴇ', ch.voice),
    '▸ ' + chLine('ғʟᴀsʜ', ch.flash),
    '▸ ' + chLine('ᴇᴍᴀɪʟ', ch.email),
    '▸ ' + chLine('ᴡᴀ ᴏʟᴅ', ch.wa_old),
    '──────────────────────',
    '▸ ᴍᴇᴛᴏᴅᴇ ⦂ <b>' + escapeHtml(String(methodStr)) + '</b>',
    r.wipeType ? ('▸ ᴡɪᴘᴇ ⦂ <b>' + escapeHtml(String(r.wipeType)) + '</b>') : null,
    '▸ ᴋᴇᴛ ⦂ ' + escapeHtml(String(r.description || '-'))
  ].filter(Boolean);
  
  return lines.join('\n');
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
  renderAccountDetail,
  renderDetectionSummary
};