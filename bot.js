require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const {
  getPackagesByTier, getPackageById, getOrCreateUser, isUserVip,
  consumeQuota, addCheckLog, getGlobalStats, getCachedCheckResult,
  setCachedCheckResult, incrementUserChecks, activateVip
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
const MAIN_KEYBOARD = Markup.keyboard([
  [{ text: '⌕ DETECT' }, { text: '✧ BELI PREMIUM' }]
]).resize().persistent().placeholder('Pilih menu atau kirim nomor…');

function isOwner(ctx) {
  return Boolean(ADMIN_ID) && Number(ctx.from && ctx.from.id) === ADMIN_ID;
}

// Reply Keyboard selalu dipasang pada balasan biasa; katalog memakai inline button.
bot.use((ctx, next) => {
  if (typeof ctx.reply === 'function') {
    const originalReply = ctx.reply.bind(ctx);
    ctx.reply = (message, extra = {}) => originalReply(message, {
      ...extra,
      ...(!extra.reply_markup ? MAIN_KEYBOARD : {})
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
  rows.push([Markup.button.callback('⌂ DASHBOARD', 'home')]);
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
      Markup.button.callback('← KEMBALI KE PAKET', 'store:premium'),
      Markup.button.callback('⌂ DASHBOARD', 'home')
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
      Markup.button.callback('← PILIH PAKET LAIN', 'store:' + pkg.tier),
      Markup.button.callback('⌂ DASHBOARD', 'home')
    ]
  ]);
  if (edit && ctx.editMessageText) return ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
  return ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
}

bot.telegram.setMyCommands([
  { command: 'start', description: 'Buka dashboard utama' },
  { command: 'detect', description: 'Mulai pemeriksaan nomor' },
  { command: 'store', description: 'Lihat paket Premium' },
  { command: 'admin', description: 'Owner console' },
  { command: 'addvip', description: 'Aktivasi membership pengguna' },
  { command: 'broadcast', description: 'Kirim pengumuman' }
]).catch((err) => console.error('[commands]', err && err.stack || err));

bot.start(showHome);
bot.command('detect', (ctx) => ctx.reply(
  '⌕ <b>MODE DETECT SIAP</b>\nKirim nomor WhatsApp dengan kode negara, contoh <code>6282298902274</code>.\nUntuk beberapa nomor, pisahkan setiap nomor dengan baris baru.',
  { parse_mode: 'HTML' }
));
bot.command('store', (ctx) => showStore(ctx, false));

bot.action('home', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  return showHome(ctx);
});
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

bot.command('admin', async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply('Akses ditolak.');
  const stats = await getGlobalStats();
  return ctx.reply(
    '◈ <b>OWNER CONSOLE</b>\n\nPengguna: <code>' + stats.totalUsers +
    '</code>\nPremium aktif: <code>' + stats.activeVip +
    '</code>\nTotal pemeriksaan: <code>' + stats.totalChecks +
    '</code>\nDataImpulse: <code>' + (isDataImpulseConfigured() ? 'TERHUBUNG' : 'BELUM DIATUR') +
    '</code>\n\n<code>/addvip USER_ID HARI</code>\n<code>/broadcast PESAN</code>',
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

  const progress = await ctx.reply('◌ <b>SEDANG MEMERIKSA</b>\nMenyiapkan koneksi dan memproses nomor…', { parse_mode: 'HTML' });
  const stats = { ready: 0, cooldown: 0, banned: 0, error: 0 };
  let lastReaction = '👀';

  for (const rawNumber of numbersList) {
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
  }

  if (vip && numbersList.length > 1) {
    await ctx.reply(
      '✦ <b>RINGKASAN PEMERIKSAAN PREMIUM</b>\n\nTotal: <code>' + numbersList.length +
      '</code>\nSiap: <code>' + stats.ready + '</code>\nCooldown: <code>' + stats.cooldown +
      '</code>\nDiblokir: <code>' + stats.banned + '</code>\nGagal: <code>' + stats.error + '</code>',
      { parse_mode: 'HTML' }
    );
  }
  await ctx.telegram.deleteMessage(ctx.chat.id, progress.message_id).catch(() => {});
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
