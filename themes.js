function renderExportDetail(detailMap) {
  if (!detailMap || Object.keys(detailMap).length === 0) return 'Tidak ada data.';
  const keys = Object.keys(detailMap);

  const groups = {
    ready: [],
    cooldown: [],
    clone: [],
    banned: [],
    other: []
  };

  for (const k of keys) {
    const r = detailMap[k];
    if (!r) continue;
    if (r.isBanned) groups.banned.push(r);
    else if (r.isCloneBlocked) groups.clone.push(r);
    else if (r.isReady) groups.ready.push(r);
    else if (r.anyCooldown) groups.cooldown.push(r);
    else groups.other.push(r);
  }

  let out = '▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰\n';
  out += '       META DETECT - EXPORT DETAIL      \n';
  out += '▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰\n\n';

  out += `Total Nomor : ${keys.length}\n`;
  out += `✧ Siap      : ${groups.ready.length}\n`;
  out += `◐ Cooldown  : ${groups.cooldown.length}\n`;
  out += `△ Clone     : ${groups.clone.length}\n`;
  out += `✕ Banned    : ${groups.banned.length}\n`;
  if (groups.other.length) out += `· Lainnya   : ${groups.other.length}\n`;
  out += '\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n';

  const pad = (label, value) => '  ▸ ' + label.padEnd(13) + '⦂ ' + value;
  const fmtSecs = (sec) => {
    if (!sec || sec <= 0) return 'ᴛᴇʀʙᴜᴋᴀ';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const h = Math.floor(sec / 3600);
    if (h > 0) return h + 'h ' + m + 'm ' + s + 's';
    if (m > 0) return m + 'm ' + s + 's';
    return s + 's';
  };

  const renderBlock = (r, index) => {
    let txt = `[ ${index} ]\n`;
    txt += pad('ɴᴏᴍᴏʀ', r.formattedNumber || '-') + '\n';
    txt += pad('sᴛᴀᴛᴜs', r.accountStatus || '-') + '\n';
    txt += pad('sᴋᴏʀ', (r.qualityScore != null ? r.qualityScore : '-') + '/100') + '\n';
    txt += pad('ᴘᴇʀᴀɴɢᴋᴀᴛ', r.deviceName || (r.waOldEligible ? 'ᴛᴇʀᴅᴀғᴛᴀʀ' : '-')) + '\n';
    txt += pad('ᴇᴍᴀɪʟ', r.maskedEmail || '-') + '\n';
    txt += pad('2ғᴀ ᴘᴀssᴡᴏʀᴅ', r.hasPassword ? 'ᴀᴋᴛɪғ' : 'ᴛɪᴅᴀᴋ') + '\n';
    txt += pad('ᴘᴀssᴋᴇʏ', r.hasPasskey ? 'ᴀᴋᴛɪғ' : 'ᴛɪᴅᴀᴋ') + '\n';
    txt += pad('ʜɪɢʜ ʀᴇ-ʀᴇɢ', r.highRereg ? 'ʏᴀ' : 'ᴛɪᴅᴀᴋ') + '\n\n';
    
    const ch = r.channels || {};
    txt += '  ♛ ᴄʜᴀɴɴᴇʟ ᴏᴛᴘ\n';
    txt += pad('sᴍs', fmtSecs(ch.sms?.rawSeconds)) + '\n';
    txt += pad('ᴠᴏɪᴄᴇ', fmtSecs(ch.voice?.rawSeconds)) + '\n';
    txt += pad('ғʟᴀsʜ', fmtSecs(ch.flash?.rawSeconds)) + '\n';
    txt += pad('ᴇᴍᴀɪʟ', fmtSecs(ch.email?.rawSeconds)) + '\n';
    txt += pad('ᴡᴀ ᴏʟᴅ', fmtSecs(ch.wa_old?.rawSeconds)) + '\n';
    
    txt += '────────────────────────────────────────\n';
    return txt;
  };

  let counter = 1;

  if (groups.ready.length) {
    out += '✧ sɪᴀᴘ ᴅɪᴠᴇʀɪꜰɪᴋᴀsɪ\n\n';
    for (const r of groups.ready) out += renderBlock(r, counter++);
    out += '\n';
  }
  
  if (groups.cooldown.length) {
    out += '◐ ᴄᴏᴏʟᴅᴏᴡɴ ᴡʜᴀᴛsᴀᴘᴘ\n\n';
    for (const r of groups.cooldown) out += renderBlock(r, counter++);
    out += '\n';
  }
  
  if (groups.clone.length) {
    out += '△ ᴄʟᴏɴᴇ / ᴜɴᴏғғɪᴄɪᴀʟ\n\n';
    for (const r of groups.clone) out += renderBlock(r, counter++);
    out += '\n';
  }
  
  if (groups.banned.length) {
    out += '✕ ᴅɪʙᴀɴ\n\n';
    for (const r of groups.banned) out += renderBlock(r, counter++);
    out += '\n';
  }
  
  if (groups.other.length) {
    out += '· ʟᴀɪɴɴʏᴀ\n\n';
    for (const r of groups.other) out += renderBlock(r, counter++);
    out += '\n';
  }

  return out;
}