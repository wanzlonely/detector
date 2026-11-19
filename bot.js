require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const {
  getPackagesByTier, getOrCreateUser, isUserVip, consumeQuota, addCheckLog,
  getGlobalStats, getCachedCheckResult, setCachedCheckResult, incrementUserChecks,
  getCheckLogs, activateVip
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
  [{ text: '⌕ Detect' }, { text: '✧ Beli Premium' }]
]).resize().persistent().placeholder('Pilih menu atau kirim nomor…');

function isOwner(ctx) {
  return Boolean(ADMIN_ID) && Number(ctx.from?.id) === ADMIN_ID;
}

async function getEffectiveUser(ctx) {
  const user = await getOrCreateUser(ctx.from);
  if (!isOwner(ctx)) return user;
  return { ...user, vip_until: 4102444800, vip_tier: 'OWNER', vip_plan: 'OWNER ACCESS', bulk_limit: 30, free_used_today: 0 };
}

async function showHome(ctx) {
  const user = await getEffectiveUser(ctx);
  const text = renderDashboard({ user, isVip: isOwner(ctx) || isUserVip(user), isOwner: isOwner(ctx), brandName: BRAND_NAME });
  return ctx.reply(text, { parse_mode: 'HTML', ...MAIN_KEYBOARD });
}

async function showStore(ctx, tier = 'standard') {
  const activeTier = tier === 'ultra' ? 'ultra' : 'standard';
  const user = await getEffectiveUser(ctx);
  const packages = getPackagesByTier(activeTier);
  const text = renderStoreCatalog({ user, activeTier, packages });
  const packageRows = [];
  for (let i = 0; i < packages.length; i += 2) {
    packageRows.push(packages.slice(i, i + 2).map((pkg) => ({
      text: \`▸ \${pkg.durationLabel} · \${formatIDR(pkg.price)}\`
    })));
  }
  const keyboard = Markup.keyboard([
    [{ text: activeTier === 'standard' ? '● Standard' : '◈ Standard' }, { text: activeTier === 'ultra' ? '● Ultra' : '♛ Ultra' }],
    ...packageRows,
    [{ text: '← Dashboard' }, { text: '⌕ Detect' }]
  ]).resize().persistent();
  return ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
}

async function showPackage(ctx, pkg) {
  const user = await getEffectiveUser(ctx);
  const text = renderPackageDetailCard({ user, pkg });
  const keyboard = Markup.keyboard([
    [{ text: \`✓ Beli \${pkg.durationLabel} · \${formatIDR(pkg.price)}\` }],
    [{ text: pkg.tier === 'ultra' ? '◈ Standard' : '♛ Ultra' }, { text: '← Katalog' }],
    [{ text: '⌕ Detect' }, { text: '← Dashboard' }]
  ]).resize().persistent();
  return ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
}

async function showCheckout(ctx, pkg) {
  const user = await getEffectiveUser(ctx);
  const text = renderPaymentMaintenanceCard({ user, pkg });
  const keyboard = Markup.keyboard([
    [{ text: '✉ Hubungi Admin' }, { text: '← Katalog' }],
    [{ text: '✧ Beli Premium' }, { text: '← Dashboard' }]
  ]).resize().persistent();
  return ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
}

bot.telegram.setMyCommands([
  { command: 'start', description: 'Buka dashboard utama' },
  { command: 'detect', description: 'Mulai pemeriksaan' },
  { command: 'store', description: 'Katalog Standard & Ultra' },
  { command: 'admin', description: 'Owner console' },
  { command: 'addvip', description: 'Aktivasi membership' },
  { command: 'broadcast', description: 'Kirim pengumuman' }
]).catch((err) => console.error('[commands]', err?.stack || err));

bot.start(showHome);
bot.command('detect', (ctx) => ctx.reply('⌕ <b>DETECT MODE</b>\nKirim nomor WhatsApp format internasional, contoh <code>6282298902274</code>. Bulk: satu nomor per baris.', { parse_mode: 'HTML', ...MAIN_KEYBOARD }));
bot.command('store', (ctx) => showStore(ctx, 'standard'));
bot.command('admin', async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply('Akses ditolak.');
  const stats = await getGlobalStats();
  return ctx.reply(
    \`◈ <b>OWNER CONSOLE</b>\n\n<blockquote>◦ Total users: <code>\${stats.totalUsers}</code>\n◦ Active VIP: <code>\${stats.activeVip}</code>\n◦ Total checks: <code>\${stats.totalChecks}</code>\n◦ DataImpulse: <code>\${isDataImpulseConfigured() ? 'CONNECTED' : 'NOT CONFIGURED'}</code></blockquote>\n\n<code>/addvip USER_ID STANDARD|ULTRA HARI</code>\n<code>/broadcast PESAN</code>\`,
    { parse_mode: 'HTML', ...MAIN_KEYBOARD }
  );
});
bot.command('addvip', async (ctx) => {
  if (!isOwner(ctx)) return;
  const parts = ctx.message.text.trim().split(/\s+/);
  const uid = Number(parts[1]);
  const tier = String(parts[2] || 'STANDARD').toUpperCase() === 'ULTRA' ? 'ULTRA' : 'STANDARD';
  const days = Number(parts[3] || parts[2]);
  if (!uid || !Number.isFinite(days) || days <= 0) {
    return ctx.reply('Format: <code>/addvip USER_ID STANDARD|ULTRA HARI</code>', { parse_mode: 'HTML' });
  }
  const result = await activateVip(uid, days, tier, \`\${tier} · \${days} Hari\`);
  return ctx.reply(\`✧ Membership \${tier} aktif untuk <code>\${uid}</code> hingga <code>\${formatDateWIB(result.expiry)}</code>.\`, { parse_mode: 'HTML', ...MAIN_KEYBOARD });
});
bot.command('broadcast', async (ctx) => {
  if (!isOwner(ctx)) return;
  const message = ctx.message.text.replace(/^\/broadcast\s*/i, '').trim();
  if (!message) return ctx.reply('Format: /broadcast Isi pengumuman');
  const stats = await getGlobalStats();
  let sent = 0;
  for (const uid of stats.allUserIds) {
    try {
      await bot.telegram.sendMessage(Number(uid), \`◈ <b>ANNOUNCEMENT</b>\n\n\${escapeHtml(message)}\`, { parse_mode: 'HTML' });
      sent += 1;
    } catch (err) {
      console.error('[broadcast]', uid, err?.message || err);
    }
  }
  return ctx.reply(\`Pengumuman terkirim ke \${sent} pengguna.\`, MAIN_KEYBOARD);
});

async function processNumbers(ctx, numbersList, options = {}) {
  const owner = isOwner(ctx);
  const user = await getEffectiveUser(ctx);
  const vip = owner || isUserVip(user);
  const ultra = owner || (vip && String(user.vip_tier).toUpperCase() === 'ULTRA');
  const maxBatch = owner ? 30 : (!vip ? 1 : Number(user.bulk_limit || 10));

  if (numbersList.length > maxBatch) {
    return ctx.reply(\`◈ <b>BATCH LIMIT</b>\nMaksimal \${maxBatch} nomor per pesan untuk akun Anda.\`, { parse_mode: 'HTML', ...MAIN_KEYBOARD });
  }
  if (!owner) {
    const allowed = await consumeQuota(ctx.from.id, numbersList.length);
    if (!allowed) return ctx.reply('◈ <b>DAILY QUOTA REACHED</b>\nKuota Free 3/3 telah digunakan. Reset otomatis pukul 00:00 WIB.', { parse_mode: 'HTML', ...MAIN_KEYBOARD });
  } else {
    await incrementUserChecks(ctx.from.id, numbersList.length);
  }

  const progress = await ctx.reply('◌ <b>INITIALIZING TELEMETRY</b>\nMenyiapkan koneksi dan memproses target…', { parse_mode: 'HTML' });
  const stats = { ready: 0, cooldown: 0, banned: 0, error: 0 };
  let lastReaction = '👀';

  for (const rawNumber of numbersList) {
    try {
      let result = options.forceFresh ? null : await getCachedCheckResult(rawNumber);
      const fromCache = Boolean(result);
      if (!result) {
        result = await checkWhatsAppCooldown(rawNumber, { isUltra: ultra });
        if (!result || typeof result !== 'object') throw new Error('Engine mengembalikan hasil kosong atau format tidak valid.');
        await setCachedCheckResult(rawNumber, result);
      }
      if (fromCache) result.proxyInfo = \`\${result.proxyInfo || ''} · CACHED\`.trim();
      const status = result.isBanned ? 'BANNED' : result.anyCooldown ? 'COOLDOWN' : 'READY';
      if (result.isBanned) stats.banned += 1;
      else if (result.anyCooldown) stats.cooldown += 1;
      else stats.ready += 1;
      lastReaction = result.isBanned ? '🚫' : result.anyCooldown ? '⏳' : '✧';
      await addCheckLog(ctx.from.id, result.formattedNumber, status, result.proxyTag);
      const currentUser = await getEffectiveUser(ctx);
      const card = renderCooldownCard({ result, user: currentUser, isVip: owner || isUserVip(currentUser) });
      await ctx.reply(card, { parse_mode: 'HTML', ...MAIN_KEYBOARD });
    } catch (err) {
      stats.error += 1;
      lastReaction = '⚠️';
      console.error('[detect] target failed:', rawNumber, err?.stack || err);
      const detail = /timeout|timed out/i.test(err?.message || '')
        ? 'Koneksi node pemeriksaan timeout. Coba kembali beberapa saat lagi.'
        : /429|rate.?limit|too many/i.test(err?.message || '')
          ? 'Node sedang membatasi permintaan. Tunggu sebentar sebelum mencoba lagi.'
          : 'Pemeriksaan gagal. Detail teknis telah dicatat pada log server.';
      await ctx.reply(\`◈ <b>DETECT FAILED</b>\n<blockquote>Target: <code>\${escapeHtml(rawNumber)}</code>\n\${detail}</blockquote>\`, { parse_mode: 'HTML', ...MAIN_KEYBOARD });
    }
  }
  if (ultra && numbersList.length > 1) {
    await ctx.reply(\`♛ <b>ULTRA BATCH SUMMARY</b>\n\n<blockquote>◦ Total: <code>\${numbersList.length}</code>\n◦ Ready: <code>\${stats.ready}</code>\n◦ Cooldown: <code>\${stats.cooldown}</code>\n◦ Banned: <code>\${stats.banned}</code>\n◦ Failed: <code>\${stats.error}</code></blockquote>\`, { parse_mode: 'HTML', ...MAIN_KEYBOARD });
  }
  await ctx.telegram.deleteMessage(ctx.chat.id, progress.message_id).catch(() => {});
  if (ctx.message?.message_id) {
    ctx.telegram.setMessageReaction(ctx.chat.id, ctx.message.message_id, [{ type: 'emoji', emoji: lastReaction }]).catch(() => {});
  }
}

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (!text || text.startsWith('/')) return;
  if (text === '⌕ Detect') return ctx.reply('⌕ <b>DETECT MODE</b>\nKirim nomor internasional, contoh <code>6282298902274</code>. Bulk: satu nomor per baris.', { parse_mode: 'HTML', ...MAIN_KEYBOARD });
  if (text === '✧ Beli Premium') return showStore(ctx, 'standard');
  if (text === '◈ Standard' || text === '● Standard') return showStore(ctx, 'standard');
  if (text === '♛ Ultra' || text === '● Ultra') return showStore(ctx, 'ultra');
  if (text === '← Dashboard') return showHome(ctx);
  if (text === '← Katalog') return showStore(ctx, 'standard');
  if (text === '✉ Hubungi Admin') {
    return ctx.reply(ADMIN_ID ? \`Hubungi operator: <a href="tg://user?id=\${ADMIN_ID}">Buka chat admin</a>\` : 'Kontak admin belum dikonfigurasi.', { parse_mode: 'HTML', ...MAIN_KEYBOARD });
  }

  const allPackages = [...getPackagesByTier('standard'), ...getPackagesByTier('ultra')];
  const selectedPackage = allPackages.find((pkg) => text === \`▸ \${pkg.durationLabel} · \${formatIDR(pkg.price)}\`);
  if (selectedPackage) return showPackage(ctx, selectedPackage);
  const checkoutPackage = allPackages.find((pkg) => text === \`✓ Beli \${pkg.durationLabel} · \${formatIDR(pkg.price)}\`);
  if (checkoutPackage) return showCheckout(ctx, checkoutPackage);

  const numbers = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^\+?[\d\s().-]{7,20}$/.test(line) && (line.match(/\d/g) || []).length >= 7 && (line.match(/\d/g) || []).length <= 15);
  if (!numbers.length) return ctx.reply('◈ <b>INPUT NOT RECOGNIZED</b>\nPilih menu atau kirim nomor internasional, misalnya <code>6282298902274</code>.', { parse_mode: 'HTML', ...MAIN_KEYBOARD });
  return processNumbers(ctx, numbers);
});

bot.catch((err, ctx) => {
  console.error(\`[telegram:update:\${ctx?.update?.update_id || 'unknown'}]\`, err?.stack || err);
  if (ctx?.chat?.id) ctx.reply('◈ <b>SYSTEM NOTICE</b>\nPermintaan belum dapat diproses. Silakan coba lagi. Jika berulang, hubungi owner.', { parse_mode: 'HTML', ...MAIN_KEYBOARD }).catch((sendErr) => console.error('[error notice]', sendErr?.message || sendErr));
});

if (require.main === module) {
  bot.launch().then(() => console.log(\`\${BRAND_NAME} online · Reply Keyboard · Owner Access\`))
    .catch((err) => { console.error('[launch]', err?.stack || err); process.exitCode = 1; });
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
module.exports = bot;
