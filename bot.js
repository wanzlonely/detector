require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const {
  redis, getPackagesByTier, getPackageById, getOrCreateUser, isUserVip,
  consumeQuota, addCheckLog, getGlobalStats, getCachedCheckResult,
  setCachedCheckResult, incrementUserChecks, activateVip, registerReferral, qualifyReferral, getReferralStats, getLeaderboard
} = require('./database');
const { isDataImpulseConfigured } = require('./proxyManager');
const { checkWhatsAppCooldown } = require('./waChecker');
const {
  escapeHtml, formatIDR, formatDateWIB, renderDashboard, renderStoreCatalog,
  renderPackageDetailCard, renderPaymentMaintenanceCard, renderCooldownCard
} = require('./themes');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = Number(process.env.ADMIN_ID || 0);
const BRAND_NAME = process.env.BRAND_NAME || 'META DETECT';
const USER_KEYBOARD = Markup.keyboard([
  [{ text: '⌕ DETECT' }, { text: '✧ BELI PREMIUM' }],
  [{ text: '◈ STATUS' }, { text: '🏆 LEADERBOARD' }],
  [{ text: '🎁 REFERRAL' }]
]).resize().persistent().placeholder('Pilih menu…');

const OWNER_KEYBOARD = Markup.keyboard([
  [{ text: '⌕ DETECT' }, { text: '✧ BELI PREMIUM' }],
  [{ text: '◈ STATUS' }, { text: '🏆 LEADERBOARD' }],
  [{ text: '🎁 REFERRAL' }],
  [{ text: '♛ OWNER CONSOLE' }],
  [{ text: '✚ AKTIVASI PREMIUM' }, { text: '▤ BROADCAST' }]
]).resize().persistent().placeholder('Pilih fungsi owner…');

const OWNER_ACTION_TTL = 300;
async function setOwnerAction(userId, action) {
  await redis.set('owner:action:' + userId, action, { ex: OWNER_ACTION_TTL });
}
async function getOwnerAction(userId) {
  return redis.get('owner:action:' + userId);
}
async function clearOwnerAction(userId) {
  await redis.del('owner:action:' + userId);
}

function isOwner(ctx) {
  return Boolean(ADMIN_ID) && Number(ctx.from && ctx.from.id) === ADMIN_ID;
}

// Reply Keyboard selalu dipasang pada balasan biasa; katalog memakai inline button.
bot.use((ctx, next) => {
  if (typeof ctx.reply === 'function') {
    const originalReply = ctx.reply.bind(ctx);
    ctx.reply = (message, extra = {}) => originalReply(message, {
      ...extra,
      ...(!extra.reply_markup ? (isOwner(ctx) ? OWNER_KEYBOARD : USER_KEYBOARD) : {})
    });
  }
  return next();
});

async function getEffectiveUser(ctx) {
  const user = await getOrCreateUser(ctx.from);
  if (!isOwner(ctx)) return user;
  return { ...user, vip_until: 4102444800, vip_tier: 'OWNER', vip_plan: 'OWNER ACCESS', bulk_limit: 30, free_used_today: 0 };
}

async function showHome(ctx) {
  const user = await getEffectiveUser(ctx);
  return ctx.reply(renderDashboard({
    user,
    isVip: isOwner(ctx) || isUserVip(user),
    isOwner: isOwner(ctx),
    brandName: BRAND_NAME
  }), { parse_mode: 'HTML' });
}

function buildStoreKeyboard() {
  const packages = getPackagesByTier('premium');
  const rows = [];
  for (let i = 0; i < packages.length; i += 2) {
    rows.push(packages.slice(i, i + 2).map((pkg) =>
      Markup.button.callback(pkg.durationLabel + ' · ' + formatIDR(pkg.price), 'pkg:' + pkg.id)
    ));
  }
  return Markup.inlineKeyboard(rows);
}
async function showStore(ctx, edit) {
  const user = await getEffectiveUser(ctx);
  const packages = getPackagesByTier('premium');
  const message = renderStoreCatalog({ user, packages });
  const keyboard = buildStoreKeyboard();
  if (edit && ctx.editMessageText) return ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
  return ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
}
async function showPackage(ctx, pkg, edit) {
  const user = await getEffectiveUser(ctx);
  const message = renderPackageDetailCard({ user, pkg });
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✓ BELI · ' + formatIDR(pkg.price), 'buy:' + pkg.id)],
    [
      Markup.button.callback('← KEMBALI KE PAKET', 'store:premium')
    ]
  ]);
  if (edit && ctx.editMessageText) return ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
  return ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
}

async function showCheckout(ctx, pkg, edit) {
  const user = await getEffectiveUser(ctx);
  const message = renderPaymentMaintenanceCard({ user, pkg });
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✉ HUBUNGI ADMIN', 'contact:' + pkg.id)],
    [
      Markup.button.callback('← PILIH PAKET LAIN', 'store:' + pkg.tier)
    ]
  ]);
  if (edit && ctx.editMessageText) return ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
  return ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
}

// Semua navigasi tersedia melalui Reply Keyboard sesuai peran akun.
bot.telegram.deleteMyCommands().catch((err) => console.error('[delete commands]', err && err.message || err));

bot.start(async (ctx) => {
  const payload = String(ctx.startPayload || '');
  if (payload.startsWith('ref_')) {
    const registered = await registerReferral(ctx.from.id, payload.slice(4));
    if (registered) await ctx.reply('🎁 Kamu bergabung melalui tautan undangan. Selesaikan 3 pemeriksaan pertama agar pengundang memperoleh hadiah 1 hari Premium.');
  }
  return showHome(ctx);
});
bot.command('detect', (ctx) => ctx.reply(
  '⌕ <b>MODE DETECT SIAP</b>\nKirim nomor WhatsApp dengan kode negara, contoh <code>6282298902274</code>.\nUntuk beberapa nomor, pisahkan setiap nomor dengan baris baru.',
  { parse_mode: 'HTML' }
));
bot.command('store', (ctx) => showStore(ctx, false));

bot.action(/^store:(?:premium|standard|ultra)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  return showStore(ctx, true);
});
bot.action(/^pkg:([a-z0-9_]+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const pkg = getPackageById(ctx.match[1]);
  if (!pkg) return ctx.reply('Paket tidak ditemukan. Silakan buka katalog kembali.');
  return showPackage(ctx, pkg, true);
});
bot.action(/^buy:([a-z0-9_]+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const pkg = getPackageById(ctx.match[1]);
  if (!pkg) return ctx.reply('Paket tidak ditemukan. Silakan buka katalog kembali.');
  return showCheckout(ctx, pkg, true);
});
bot.action(/^contact:([a-z0-9_]+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  return ctx.reply(
    ADMIN_ID
      ? '✉ <b>BANTUAN PEMBELIAN</b>\nSilakan hubungi <a href="tg://user?id=' + ADMIN_ID + '">Admin MetaDetect</a> untuk aktivasi paket.'
      : 'Kontak admin belum dikonfigurasi.',
    { parse_mode: 'HTML' }
  );
});


async function showStatus(ctx) {
  const user = await getEffectiveUser(ctx);
  const referralStats = await getReferralStats(ctx.from.id);
  return ctx.reply(require('./themes').renderStatus({ user, isVip: isOwner(ctx) || isUserVip(user), isOwner: isOwner(ctx), referralStats }), { parse_mode: 'HTML' });
}
async function showLeaderboard(ctx) {
  return ctx.reply(require('./themes').renderLeaderboard(await getLeaderboard(10)), { parse_mode: 'HTML' });
}
async function showReferral(ctx) {
  const me = await bot.telegram.getMe();
  const link = 'https://t.me/' + me.username + '?start=ref_' + ctx.from.id;
  const stats = await getReferralStats(ctx.from.id);
  const shareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent('Gabung MetaDetect melalui tautan undanganku!');
  return ctx.reply(require('./themes').renderReferral({ link, stats }), { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.url('↗ BAGIKAN TAUTAN', shareUrl)]]) });
}
bot.hears('◈ STATUS', showStatus);
bot.hears('🏆 LEADERBOARD', showLeaderboard);
bot.hears('🎁 REFERRAL', showReferral);

bot.hears('♛ OWNER CONSOLE', async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply('⛔ <b>AKSES TIDAK DIIZINKAN</b>\\nFitur ini hanya tersedia untuk akun Owner MetaDetect.');
  const stats = await getGlobalStats();
  return ctx.reply('♛ <b>OWNER CONSOLE</b>\n\nPengguna: <code>' + stats.totalUsers + '</code>\nPremium aktif: <code>' + stats.activeVip + '</code>\nTotal pemeriksaan: <code>' + stats.totalChecks + '</code>\nDataImpulse: <code>' + (isDataImpulseConfigured() ? 'TERHUBUNG' : 'BELUM DIATUR') + '</code>', { parse_mode: 'HTML' });
});
bot.hears('✚ AKTIVASI PREMIUM', async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply('Akses ditolak.');
  await setOwnerAction(ctx.from.id, 'activate');
  return ctx.reply(`✚ <b>AKTIVASI PREMIUM</b>\nKirim dengan format <code>ID_TELEGRAM DURASI_HARI</code>.\nContoh: <code>123456789 7</code>.\nKirim <code>BATAL</code> untuk membatalkan.`, { parse_mode: 'HTML' });
});
bot.hears('▤ BROADCAST', async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply('Akses ditolak.');
  await setOwnerAction(ctx.from.id, 'broadcast');
  return ctx.reply('▤ <b>BROADCAST</b>\nKirim isi pengumuman yang ingin disampaikan kepada semua pengguna.', { parse_mode: 'HTML' });
});
bot.command('admin', async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply('Akses ditolak.');
  const stats = await getGlobalStats();
  return ctx.reply(
    '◈ <b>OWNER CONSOLE</b>\n\nPengguna: <code>' + stats.totalUsers +
    '</code>\nPremium aktif: <code>' + stats.activeVip +
    '</code>\nTotal pemeriksaan: <code>' + stats.totalChecks +
    '</code>\nDataImpulse: <code>' + (isDataImpulseConfigured() ? 'TERHUBUNG' : 'BELUM DIATUR') +
    '</code>',
    { parse_mode: 'HTML' }
  );
});

bot.command('addvip', async (ctx) => {
  if (!isOwner(ctx)) return;
  const parts = ctx.message.text.trim().split(/\s+/);
  const uid = Number(parts[1]);
  const hasLegacyTier = ['STANDARD', 'ULTRA', 'PREMIUM'].includes(String(parts[2] || '').toUpperCase());
  const days = Number(hasLegacyTier ? parts[3] : parts[2]);
  if (!uid || !Number.isFinite(days) || days <= 0) {
    return ctx.reply('Format: <code>/addvip USER_ID HARI</code>', { parse_mode: 'HTML' });
  }
  const result = await activateVip(uid, days, 'PREMIUM', 'PREMIUM · ' + days + ' Hari');
  return ctx.reply('✧ Premium aktif untuk <code>' + uid + '</code> sampai <code>' + formatDateWIB(result.expiry) + '</code>.', { parse_mode: 'HTML' });
});

bot.command('broadcast', async (ctx) => {
  if (!isOwner(ctx)) return;
  const message = ctx.message.text.replace(/^\/broadcast\s*/i, '').trim();
  if (!message) return ctx.reply('Format: /broadcast Isi pengumuman');
  const stats = await getGlobalStats();
  let sent = 0;
  for (const uid of stats.allUserIds) {
    try {
      await bot.telegram.sendMessage(Number(uid), '✧ <b>INFO META DETECT</b>\n\n' + escapeHtml(message), { parse_mode: 'HTML' });
      sent += 1;
    } catch (err) {
      console.error('[broadcast]', uid, err && err.message || err);
    }
  }
  return ctx.reply('Pengumuman berhasil dikirim ke ' + sent + ' pengguna.');
});


function buildProgressText(done, total, stage, frame = 0) {
  const percent = Math.min(100, Math.floor(done / Math.max(1, total) * 100));
  const filled = Math.floor(percent / 10);
  const bar = '▰'.repeat(filled) + '▱'.repeat(10 - filled);
  const spinner = ['◐', '◓', '◑', '◒'][frame % 4];
  return '⚡ <b>DETECT SEDANG BERJALAN</b>\n' + spinner + ' ' + stage +
    '\n\n<code>' + bar + '</code> <b>' + percent + '%</b>' +
    '\nProgres: <b>' + done + ' / ' + total + '</b> nomor' +
    '\n<i>Hasil akan ditampilkan otomatis.</i>';
}
bot.action(/^detect:stop:(\d+):(\d+)$/, async (ctx) => {
  if (Number(ctx.from.id) !== Number(ctx.match[1])) return ctx.answerCbQuery('Sesi ini bukan milikmu.', { show_alert: true });
  await redis.set('detect:stop:' + ctx.match[1] + ':' + ctx.match[2], '1', { ex: 600 });
  return ctx.answerCbQuery('Permintaan berhenti diterima.');
});

async function processNumbers(ctx, numbersList) {
  const owner = isOwner(ctx);
  const user = await getEffectiveUser(ctx);
  const vip = owner || isUserVip(user);
  const maxBatch = owner ? 30 : (!vip ? 1 : Math.min(10, Number(user.bulk_limit || 10)));
  const premiumAccess = vip;

  if (numbersList.length > maxBatch) {
    return ctx.reply('◈ <b>BATAS PEMERIKSAAN</b>\nAkun ini dapat memeriksa maksimal <b>' + maxBatch + ' nomor</b> dalam satu kiriman.', { parse_mode: 'HTML' });
  }
  if (!owner) {
    const allowed = await consumeQuota(ctx.from.id, numbersList.length);
    if (!allowed) return ctx.reply('◈ <b>KUOTA HARIAN HABIS</b>\nKuota gratis 3 pemeriksaan sudah digunakan. Kuota diperbarui pukul 00.00 WIB.', { parse_mode: 'HTML' });
  } else {
    await incrementUserChecks(ctx.from.id, numbersList.length);
  }

  const jobId = String(Date.now());
  const stopKey = 'detect:stop:' + ctx.from.id + ':' + jobId;
  let completed = 0;
  let stage = 'Menyiapkan sesi pemeriksaan';
  let frame = 0;
  const stopMarkup = Markup.inlineKeyboard([[Markup.button.callback('⏹ HENTIKAN DETEKSI', 'detect:stop:' + ctx.from.id + ':' + jobId)]]);
  const progress = await ctx.reply(buildProgressText(0, numbersList.length, stage), { parse_mode: 'HTML', ...stopMarkup });
  const timer = setInterval(() => {
    frame = (frame + 1) % 4;
    ctx.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, buildProgressText(completed, numbersList.length, stage, frame), { parse_mode: 'HTML', ...stopMarkup }).catch(() => {});
  }, 2200);
  const stats = { ready: 0, cooldown: 0, banned: 0, error: 0 };
  let lastReaction = '👀';
  let stopped = false;

  for (const rawNumber of numbersList) {
    if (await redis.get(stopKey)) { stopped = true; break; }
    stage = 'Memeriksa target ' + (completed + 1) + ' dari ' + numbersList.length;
    try {
      let result = await getCachedCheckResult(rawNumber);
      const fromCache = Boolean(result);
      if (!result) {
        result = await checkWhatsAppCooldown(rawNumber, { isPremium: premiumAccess });
        if (!result || typeof result !== 'object') throw new Error('Engine mengembalikan hasil kosong atau format tidak valid.');
        await setCachedCheckResult(rawNumber, result);
      }
      if (fromCache) result.proxyInfo = String(result.proxyInfo || '') + ' · CACHE';
      const status = result.isBanned ? 'DIBLOKIR' : result.anyCooldown ? 'COOLDOWN' : 'SIAP';
      if (result.isBanned) stats.banned += 1;
      else if (result.anyCooldown) stats.cooldown += 1;
      else stats.ready += 1;
      lastReaction = result.isBanned ? '🚫' : result.anyCooldown ? '⏳' : '✧';
      await addCheckLog(ctx.from.id, result.formattedNumber, status, result.proxyTag);
      const reward = await qualifyReferral(ctx.from.id);
      if (reward.rewarded) await bot.telegram.sendMessage(reward.inviter, '🎁 <b>HADIAH REFERRAL!</b> Teman undanganmu menyelesaikan 3 pemeriksaan. Kamu mendapat tambahan <b>1 hari Premium</b>.', { parse_mode: 'HTML' }).catch(() => {});
      const currentUser = await getEffectiveUser(ctx);
      await ctx.reply(renderCooldownCard({
        result,
        user: currentUser,
        isVip: owner || isUserVip(currentUser)
      }), { parse_mode: 'HTML' });
    } catch (err) {
      stats.error += 1;
      lastReaction = '⚠️';
      console.error('[detect] target failed:', rawNumber, err && err.stack || err);
      const detail = /timeout|timed out/i.test(err && err.message || '')
        ? 'Koneksi pemeriksaan melewati batas waktu. Coba lagi beberapa saat.'
        : /429|rate.?limit|too many/i.test(err && err.message || '')
          ? 'Server sedang membatasi permintaan. Tunggu sebentar sebelum mencoba lagi.'
          : 'Pemeriksaan gagal diproses. Silakan coba lagi nanti.';
      await ctx.reply('⚠️ <b>PEMERIKSAAN GAGAL</b>\nNomor: <code>' + escapeHtml(rawNumber) + '</code>\n' + detail, { parse_mode: 'HTML' });
    }
    completed += 1;
    stage = 'Memperbarui hasil pemeriksaan';
    await ctx.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, buildProgressText(completed, numbersList.length, stage, ++frame), { parse_mode: 'HTML', ...stopMarkup }).catch(() => {});
  }

  if (vip && numbersList.length > 1) {
    await ctx.reply(
      '✦ <b>RINGKASAN PEMERIKSAAN PREMIUM</b>\n\nTotal: <code>' + numbersList.length +
      '</code>\nSiap: <code>' + stats.ready + '</code>\nCooldown: <code>' + stats.cooldown +
      '</code>\nDiblokir: <code>' + stats.banned + '</code>\nGagal: <code>' + stats.error + '</code>',
      { parse_mode: 'HTML' }
    );
  }
  clearInterval(timer);
  await redis.del(stopKey).catch(() => {});
  const finalText = (stopped ? '⏹ <b>PEMERIKSAAN DIHENTIKAN</b>' : '✓ <b>PEMERIKSAAN SELESAI</b>') + '\n\n' + buildProgressText(completed, numbersList.length, stopped ? 'Dihentikan oleh pengguna' : 'Seluruh target selesai') + '\n\n✧ Berhasil: <b>' + (stats.ready + stats.cooldown + stats.banned) + '</b> · ⚠ Gagal: <b>' + stats.error + '</b>';
  await ctx.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, finalText, { parse_mode: 'HTML' }).catch(() => {});
  if (ctx.message && ctx.message.message_id) {
    ctx.telegram.setMessageReaction(ctx.chat.id, ctx.message.message_id, [{ type: 'emoji', emoji: lastReaction }]).catch(() => {});
  }
}

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (!text || text.startsWith('/')) return;
  if (text === '⌕ DETECT' || text === '⌕ Detect' || text === 'Detect') {
    return ctx.reply(
      '⌕ <b>MODE DETECT SIAP</b>\nKirim nomor WhatsApp dengan kode negara, contoh <code>6282298902274</code>.\nBeberapa nomor? Pisahkan dengan baris baru.',
      { parse_mode: 'HTML' }
    );
  }
  if (text === '✧ BELI PREMIUM' || text === '✧ Beli Premium' || text === 'Beli Premium') {
    return showStore(ctx, false);
  }
  if (text === '/cancel' || text.toUpperCase() === 'BATAL') {
    if (isOwner(ctx)) await clearOwnerAction(ctx.from.id);
    return ctx.reply('✕ <b>PROSES DIBATALKAN</b>\\nTidak ada perubahan yang dilakukan. Kamu dapat memilih menu lain kapan saja.');
  }
  if (isOwner(ctx)) {
    const action = await getOwnerAction(ctx.from.id);
    if (action === 'activate') {
      const [uidText, daysText] = text.trim().split(/\s+/);
      const uid = Number(uidText);
      const days = Number(daysText);
      if (!Number.isSafeInteger(uid) || uid <= 0 || !Number.isFinite(days) || days <= 0 || days > 3650) {
        return ctx.reply('Format belum benar. Kirim <code>ID_TELEGRAM DURASI_HARI</code>, contoh <code>123456789 7</code>.', { parse_mode: 'HTML' });
      }
      const activated = await activateVip(uid, days, 'PREMIUM', 'PREMIUM · ' + days + ' Hari');
      await clearOwnerAction(ctx.from.id);
      return ctx.reply('✦ Premium berhasil diaktifkan untuk <code>' + uid + '</code> hingga <code>' + formatDateWIB(activated.expiry) + '</code>.', { parse_mode: 'HTML' });
    }
    if (action === 'broadcast') {
      await clearOwnerAction(ctx.from.id);
      const stats = await getGlobalStats();
      let sent = 0;
      for (const uid of stats.allUserIds) {
        try {
          await bot.telegram.sendMessage(Number(uid), '✦ <b>INFO META DETECT</b>\n\n' + escapeHtml(text), { parse_mode: 'HTML' });
          sent += 1;
        } catch (err) {
          console.error('[broadcast]', uid, err && err.message || err);
        }
      }
      return ctx.reply('✦ <b>BROADCAST SELESAI</b>\\n\\n◉ Berhasil terkirim: <b>' + sent + '</b> dari <b>' + stats.allUserIds.length + '</b> pengguna.\\n<i>Akun yang memblokir bot atau tidak dapat menerima pesan mungkin tidak terjangkau.</i>');
    }
  }

  const numbers = text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\+?[\d\s().-]{7,20}$/.test(line) && (line.match(/\d/g) || []).length >= 7 && (line.match(/\d/g) || []).length <= 15);
  if (!numbers.length) {
    return ctx.reply(
      '⌁ <b>PERINTAH TIDAK DIKENALI</b>\nGunakan tombol menu di bawah atau kirim nomor internasional, contoh <code>6282298902274</code>.',
      { parse_mode: 'HTML' }
    );
  }
  return processNumbers(ctx, numbers);
});

bot.catch((err, ctx) => {
  console.error('[telegram:update:' + (ctx && ctx.update && ctx.update.update_id || 'unknown') + ']', err && err.stack || err);
  if (ctx && ctx.chat && ctx.chat.id) {
    ctx.reply(
      '⚠️ <b>TERJADI GANGGUAN</b>\nPermintaan belum dapat diproses. Silakan coba kembali. Jika berulang, hubungi admin.',
      { parse_mode: 'HTML' }
    ).catch((sendErr) => console.error('[error notice]', sendErr && sendErr.message || sendErr));
  }
});

if (require.main === module) {
  bot.launch()
    .then(() => console.log(BRAND_NAME + ' aktif · Reply Keyboard + Inline Catalog'))
    .catch((err) => { console.error('[launch]', err && err.stack || err); process.exitCode = 1; });
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
module.exports = bot;
