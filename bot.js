require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const {
  getPackagesByTier,
  getPackageById,
  getAlternateTierPackage,
  getOrCreateUser,
  updateUserPreferences,
  isUserVip,
  consumeQuota,
  activateVip,
  addCheckLog,
  getCheckLogs,
  getGlobalStats,
  getCachedCheckResult,
  setCachedCheckResult
} = require('./database');
const { isDataImpulseConfigured } = require('./proxyManager');
const { checkWhatsAppCooldown } = require('./waChecker');
const {
  THEMES,
  getTheme,
  escapeHtml,
  btn,
  formatIDR,
  formatDateWIB,
  renderDashboard,
  renderStoreCatalog,
  renderPackageDetailCard,
  renderPaymentMaintenanceCard,
  renderCooldownCard
} = require('./themes');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = Number(process.env.ADMIN_ID);
const BRAND_NAME = process.env.BRAND_NAME || 'META DETECT';

bot.telegram
  .setMyCommands([
    { command: 'start', description: '🏠 Buka Dashboard' },
    { command: 'detect', description: '🔍 Mulai Deteksi Nomor' },
    { command: 'store', description: '⚡ Beli Premium' }
  ])
  .catch((err) => console.error('setMyCommands failed:', err?.message || err));

function mainReplyKeyboard(isAdmin = false) {
  const rows = [
    ['🔍 Detect', '⚡ Beli Premium'],
    ['🏠 Dashboard']
  ];
  if (isAdmin) {
    rows.push(['👑 Admin Console']);
  }
  return Markup.keyboard(rows).resize().persistent();
}

function storeReplyKeyboard() {
  return Markup.keyboard([
    ['⚡ Standard', '👑 Ultra'],
    ['🏠 Kembali ke Dashboard']
  ]).resize().persistent();
}

async function sendHome(ctx) {
  const user = await getOrCreateUser(ctx.from);
  const vip = isUserVip(user);
  const text = renderDashboard({
    user,
    isVip: vip,
    brandName: BRAND_NAME
  });
  return ctx.reply(text, {
    parse_mode: 'HTML',
    ...mainReplyKeyboard(ctx.from.id === ADMIN_ID)
  });
}

bot.start(async (ctx) => {
  await sendHome(ctx);
});

bot.hears(['🏠 Dashboard', '🏠 Kembali ke Dashboard'], async (ctx) => {
  await sendHome(ctx);
});

bot.hears('🔍 Detect', async (ctx) => {
  await ctx.reply(
    `✧ <b>DETECT MODE</b>\n\n` +
    `<blockquote>` +
    `Kirim nomor WhatsApp sekarang (format internasional).\n\n` +
    `Contoh:\n<code>6282298902274</code>\n\n` +
    `Bisa kirim beberapa nomor sekaligus (satu baris satu nomor).` +
    `</blockquote>`,
    { parse_mode: 'HTML', ...mainReplyKeyboard(ctx.from.id === ADMIN_ID) }
  );
});

async function renderStoreByTier(ctx, tier = 'standard') {
  const normalizedTier = tier === 'ultra' ? 'ultra' : 'standard';
  const user = await getOrCreateUser(ctx.from);
  const packages = getPackagesByTier(normalizedTier);

  const text = renderStoreCatalog({
    user,
    activeTier: normalizedTier,
    packages
  });

  let packageList = '';
  packages.forEach((pkg, i) => {
    packageList += `${i + 1}. <b>${pkg.durationLabel}</b> · ${formatIDR(pkg.price)} · ${pkg.tag}\n   <i>${pkg.highlight}</i>\n\n`;
  });

  const fullText = text + `\n<blockquote>${packageList}</blockquote>\n\n` +
    `<i>Balas dengan nomor paket (contoh: 1) untuk melihat detail.</i>`;

  return ctx.reply(fullText, {
    parse_mode: 'HTML',
    ...storeReplyKeyboard()
  });
}

bot.hears(['⚡ Beli Premium', '/store'], async (ctx) => {
  await renderStoreByTier(ctx, 'standard');
});

bot.hears('⚡ Standard', async (ctx) => {
  await renderStoreByTier(ctx, 'standard');
});

bot.hears('👑 Ultra', async (ctx) => {
  await renderStoreByTier(ctx, 'ultra');
});

bot.hears('👑 Admin Console', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const stats = await getGlobalStats();
  const proxyActive = isDataImpulseConfigured();

  await ctx.reply(
    `◈ <b>ADMIN CONSOLE</b>\n\n` +
      `<blockquote>` +
      `▪ <b>Total Users:</b> <code>${stats.totalUsers}</code>\n` +
      `▪ <b>Active VIP:</b> <code>${stats.activeVip}</code>\n` +
      `▪ <b>Total Checks:</b> <code>${stats.totalChecks}</code>\n` +
      `▪ <b>DataImpulse:</b> <code>${proxyActive ? 'CONNECTED (ROTATING)' : 'NOT SET'}</code>\n` +
      `▪ <b>Payment:</b> <code>MANUAL / IN PROGRESS</code>` +
      `</blockquote>\n\n` +
      `<blockquote expandable>` +
      `<b>ADMIN COMMANDS:</b>\n` +
      `• <code>/addvip USER_ID STANDARD 7</code>\n` +
      `• <code>/addvip USER_ID ULTRA 20</code>\n` +
      `• <code>/broadcast PESAN</code>` +
      `</blockquote>`,
    {
      parse_mode: 'HTML',
      ...mainReplyKeyboard(true)
    }
  );
});

bot.command('addvip', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length < 4) {
    return ctx.reply('Format: <code>/addvip USER_ID STANDARD|ULTRA HARI</code>', { parse_mode: 'HTML' });
  }
  const uid = Number(parts[1]);
  const tier = String(parts[2]).toUpperCase();
  const days = Number(parts[3]);
  if (!uid || !days || !['STANDARD', 'ULTRA'].includes(tier)) {
    return ctx.reply('Format salah. Contoh: <code>/addvip 123456789 ULTRA 30</code>', { parse_mode: 'HTML' });
  }

  const { expiry } = await activateVip(uid, days, tier);
  await ctx.reply(
    `◈ Paket <b>${tier}</b> (${days} Hari) aktif untuk <code>${uid}</code> s/d <code>${formatDateWIB(expiry)}</code>.`,
    { parse_mode: 'HTML' }
  );

  await bot.telegram
    .sendMessage(
      uid,
      `◈ <b>MEMBERSHIP ACTIVATED</b>\n\n<blockquote>▪ <b>Tier:</b> <code>${tier}</code>\n▪ <b>Durasi:</b> <code>${days} Hari</code>\n▪ <b>Berlaku Hingga:</b> <code>${formatDateWIB(expiry)}</code></blockquote>`,
      { parse_mode: 'HTML' }
    )
    .catch(() => {});
});

bot.command('broadcast', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const msg = ctx.message.text.replace(/^\/broadcast\s*/i, '').trim();
  if (!msg) return ctx.reply('Format: <code>/broadcast Isi pengumuman</code>', { parse_mode: 'HTML' });

  const stats = await getGlobalStats();
  let sent = 0;
  for (const uid of stats.allUserIds || []) {
    try {
      await bot.telegram.sendMessage(Number(uid), `◈ <b>ANNOUNCEMENT</b>\n\n<blockquote>${escapeHtml(msg)}</blockquote>`, {
        parse_mode: 'HTML'
      });
      sent += 1;
    } catch (_) {}
  }
  await ctx.reply(`◈ Broadcast terkirim ke <code>${sent}</code> pengguna.`, { parse_mode: 'HTML' });
});

async function processNumbers(ctx, numbersList, options = {}) {
  const forceFresh = Boolean(options.forceFresh);
  const user = await getOrCreateUser(ctx.from);
  const vip = isUserVip(user);
  const t = getTheme(user.theme || 'aurora');
  const isUltra = vip && String(user.vip_tier).toUpperCase() === 'ULTRA';
  const maxBatch = !vip ? 1 : Number(user.bulk_limit || 10);

  if (numbersList.length > maxBatch) {
    const reasonText = !vip
      ? 'Akun Free hanya mendukung 1 nomor per kirim (maksimal 3 nomor/hari). Upgrade ke Standard (10/batch) atau Ultra (30/batch).'
      : `Batas Bulk Check paket Anda adalah ${maxBatch} nomor per kirim.`;

    return ctx.reply(
      `${t.mark} <b>BATCH LIMIT EXCEEDED</b>\n\n<blockquote>${reasonText}</blockquote>`,
      {
        parse_mode: 'HTML',
        ...mainReplyKeyboard(ctx.from.id === ADMIN_ID)
      }
    );
  }

  const allowed = await consumeQuota(ctx.from.id, numbersList.length);
  if (!allowed) {
    return ctx.reply(
      `${t.mark} <b>DAILY QUOTA REACHED (3/3)</b>\n\n<blockquote>Kuota gratis Anda telah habis dan akan di-reset otomatis pukul <code>00:00 WIB</code>.</blockquote>`,
      {
        parse_mode: 'HTML',
        ...mainReplyKeyboard(ctx.from.id === ADMIN_ID)
      }
    );
  }

  if (ctx.message?.message_id) {
    ctx.telegram.setMessageReaction(ctx.chat.id, ctx.message.message_id, [{ type: 'emoji', emoji: '👀' }]).catch(() => {});
  }
  ctx.sendChatAction('typing').catch(() => {});

  const hudMsg = await ctx.reply(
    `<pre>[${t.barFill}${t.barEmpty.repeat(4)}] 25% · Initializing DataImpulse IP rotation...</pre>`,
    { parse_mode: 'HTML' }
  );

  await new Promise((r) => setTimeout(r, 400));
  await ctx.telegram
    .editMessageText(
      ctx.chat.id,
      hudMsg.message_id,
      undefined,
      `<pre>[${t.barFill.repeat(3)}${t.barEmpty.repeat(2)}] 70% · Querying WA nodes via fresh IP...</pre>`,
      { parse_mode: 'HTML' }
    )
    .catch(() => {});

  let lastReaction = '🔥';
  const batchStats = { ready: 0, cooldown: 0, banned: 0, error: 0 };

  for (const rawNum of numbersList) {
    try {
      let result = forceFresh ? null : await getCachedCheckResult(rawNum);
      let fromCache = Boolean(result);

      if (!result) {
        result = await checkWhatsAppCooldown(rawNum, { isUltra });
        await setCachedCheckResult(rawNum, result);
      }

      const summary = result.isBanned ? 'BANNED' : result.anyCooldown ? 'COOLDOWN' : 'READY';
      lastReaction = result.isBanned ? '🚫' : result.anyCooldown ? '⏳' : '🔥';
      if (fromCache) result.proxyInfo = `${result.proxyInfo || ''} · CACHED`.trim();

      if (result.isBanned) batchStats.banned += 1;
      else if (result.anyCooldown) batchStats.cooldown += 1;
      else batchStats.ready += 1;

      await addCheckLog(ctx.from.id, result.formattedNumber, summary, result.proxyTag);

      const freshUser = await getOrCreateUser(ctx.from);
      const card = renderCooldownCard({
        result,
        user: freshUser,
        isVip: isUserVip(freshUser)
      });

      await ctx.reply(card, {
        parse_mode: 'HTML',
        ...mainReplyKeyboard(ctx.from.id === ADMIN_ID)
      });
    } catch (err) {
      lastReaction = '❌';
      batchStats.error += 1;
      await ctx.reply(
        `${t.mark} <b>TELEMETRY ERROR</b>\n<blockquote>Target: <code>${escapeHtml(rawNum)}</code>\nDetail: <i>${escapeHtml(err.message)}</i></blockquote>`,
        { parse_mode: 'HTML', ...mainReplyKeyboard(ctx.from.id === ADMIN_ID) }
      );
    }
  }

  if (isUltra && numbersList.length > 1) {
    await ctx.reply(
      `👑 <b>ULTRA BATCH TELEMETRY SUMMARY</b>\n\n` +
        `<blockquote>` +
        `${t.bullet} <b>Total Diproses:</b> <code>${numbersList.length} Nomor</code>\n` +
        `${t.bullet} <b>All Clear (Ready):</b> <code>${batchStats.ready}</code>\n` +
        `${t.bullet} <b>Active Cooldown:</b> <code>${batchStats.cooldown}</code>\n` +
        `${t.bullet} <b>Banned / Error:</b> <code>${batchStats.banned + batchStats.error}</code>` +
        `</blockquote>`,
      { parse_mode: 'HTML' }
    );
  }

  if (ctx.message?.message_id) {
    ctx.telegram.setMessageReaction(ctx.chat.id, ctx.message.message_id, [{ type: 'emoji', emoji: lastReaction }]).catch(() => {});
  }
  await ctx.telegram.deleteMessage(ctx.chat.id, hudMsg.message_id).catch(() => {});
}

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return;

  const keyboardButtons = [
    '🔍 Detect', '⚡ Beli Premium', '🏠 Dashboard', '🏠 Kembali ke Dashboard',
    '⚡ Standard', '👑 Ultra', '👑 Admin Console'
  ];
  if (keyboardButtons.includes(text)) return;

  const candidates = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /\d{7,15}/.test(l));

  if (candidates.length === 0) {
    return ctx.reply(
      `◈ <b>INVALID INPUT</b>\n<blockquote>Kirim nomor WhatsApp dengan kode negara, contoh: <code>6282298902274</code></blockquote>`,
      { parse_mode: 'HTML', ...mainReplyKeyboard(ctx.from.id === ADMIN_ID) }
    );
  }

  return processNumbers(ctx, candidates);
});

bot.catch((err, ctx) => {
  console.error(`Unhandled error for update ${ctx.update?.update_id}:`, err);
  ctx.reply(
    '◈ <b>SYSTEM ERROR</b>\n<blockquote>Terjadi kesalahan tak terduga. Silakan coba lagi.</blockquote>',
    { parse_mode: 'HTML' }
  ).catch(() => {});
});

if (require.main === module) {
  bot.launch().then(() => console.log(`${BRAND_NAME} active with Dual-Tier Store & DataImpulse IP Rotation`));
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

module.exports = bot;
