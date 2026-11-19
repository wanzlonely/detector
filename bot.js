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
const BRAND_NAME = process.env.BRAND_NAME || 'NEXUS TELEMETRY';

bot.telegram
  .setMyCommands([
    { command: 'start', description: '🏠 Buka Telemetry Dashboard' },
    { command: 'store', description: '⚡ Katalog Paket Standard & Ultra' },
    { command: 'theme', description: '🎨 Atur Tema & Privacy Blur' },
    { command: 'history', description: '📜 Riwayat Pengecekan Terakhir' }
  ])
  .catch((err) => console.error('setMyCommands failed:', err?.message || err));

function safeEdit(ctx, text, extra) {
  return ctx.editMessageText(text, extra).catch((err) => {
    if (!/message is not modified/i.test(err?.description || '')) {
      return ctx.reply(text, extra).catch(() => {});
    }
  });
}

function mainKeyboard(isAdmin = false) {
  const rows = [
    [btn('Premium Store (Standard & Ultra)', 'store_tier_standard', 'primary')],
    [btn('🎨 Themes & UI', 'view_themes'), btn('📜 Audit Logs', 'view_history')],
    [btn('🔄 Sync Status', 'view_home'), btn('💬 Support', 'view_support')]
  ];
  if (isAdmin) rows.push([btn('Admin Console', 'view_admin', 'danger')]);
  return Markup.inlineKeyboard(rows);
}

async function sendOrEditHome(ctx, isEdit = false) {
  const user = await getOrCreateUser(ctx.from);
  const text = renderDashboard({
    user,
    isVip: isUserVip(user),
    brandName: BRAND_NAME
  });
  const extra = { parse_mode: 'HTML', ...mainKeyboard(ctx.from.id === ADMIN_ID) };

  if (isEdit) {
    return safeEdit(ctx, text, extra);
  }
  return ctx.reply(text, extra);
}

bot.start((ctx) => sendOrEditHome(ctx, false));
bot.action('view_home', async (ctx) => {
  await ctx.answerCbQuery('Synced');
  return sendOrEditHome(ctx, true);
});

async function renderStoreByTier(ctx, tier = 'standard', isEdit = true) {
  const normalizedTier = tier === 'ultra' ? 'ultra' : 'standard';
  const user = await getOrCreateUser(ctx.from);
  const packages = getPackagesByTier(normalizedTier);

  const text = renderStoreCatalog({
    user,
    activeTier: normalizedTier,
    packages
  });

  const tabRow = [
    btn(
      normalizedTier === 'standard' ? '● ⚡ Standard' : '⚡ Standard',
      'store_tier_standard',
      normalizedTier === 'standard' ? 'primary' : null
    ),
    btn(
      normalizedTier === 'ultra' ? '● 👑 Ultra' : '👑 Ultra',
      'store_tier_ultra',
      normalizedTier === 'ultra' ? 'primary' : null
    )
  ];

  const packageRows = [];
  for (let i = 0; i < packages.length; i += 2) {
    const pair = packages.slice(i, i + 2).map((pkg) =>
      btn(`${pkg.durationLabel} · ${formatIDR(pkg.price)}`, `pkg_detail_${pkg.id}`)
    );
    packageRows.push(pair);
  }

  const keyboard = Markup.inlineKeyboard([
    tabRow,
    ...packageRows,
    [btn('← Back to Dashboard', 'view_home')]
  ]);

  if (isEdit) {
    return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
  }
  return ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
}

bot.command('store', (ctx) => renderStoreByTier(ctx, 'standard', false));
bot.action('view_store', async (ctx) => {
  await ctx.answerCbQuery();
  return renderStoreByTier(ctx, 'standard', true);
});
bot.action(/^store_tier_(standard|ultra)$/, async (ctx) => {
  const selectedTier = ctx.match[1];
  await ctx.answerCbQuery(`Menampilkan paket ${selectedTier.toUpperCase()}`);
  return renderStoreByTier(ctx, selectedTier, true);
});

bot.action(/^pkg_detail_(.+)$/, async (ctx) => {
  const pkg = getPackageById(ctx.match[1]);
  if (!pkg) return ctx.answerCbQuery('Paket tidak ditemukan', { show_alert: true });

  await ctx.answerCbQuery();
  const user = await getOrCreateUser(ctx.from);
  const altPkg = getAlternateTierPackage(pkg);
  const text = renderPackageDetailCard({ user, pkg });

  const rows = [
    [btn(`Beli Paket Ini (${formatIDR(pkg.price)}) →`, `checkout_${pkg.id}`, 'primary')]
  ];

  if (altPkg) {
    const switchLabel =
      altPkg.tier === 'ultra'
        ? `👑 Upgrade ke Ultra ${altPkg.durationLabel} (${formatIDR(altPkg.price)})`
        : `⚡ Lihat Standard ${altPkg.durationLabel} (${formatIDR(altPkg.price)})`;
    rows.push([btn(switchLabel, `pkg_detail_${altPkg.id}`)]);
  }

  rows.push([btn(`← Kembali ke Katalog ${pkg.tier.toUpperCase()}`, `store_tier_${pkg.tier}`)]);

  await safeEdit(ctx, text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(rows)
  });
});

bot.action(/^checkout_(.+)$/, async (ctx) => {
  const pkg = getPackageById(ctx.match[1]);
  if (!pkg) return ctx.answerCbQuery('Paket tidak ditemukan', { show_alert: true });

  await ctx.answerCbQuery('Sistem pembayaran sedang dalam proses pengerjaan', { show_alert: true });
  const user = await getOrCreateUser(ctx.from);
  const text = renderPaymentMaintenanceCard({ user, pkg });

  const rows = [];
  if (ADMIN_ID) {
    rows.push([Markup.button.url('💬 Hubungi Admin (Aktivasi Manual)', `tg://user?id=${ADMIN_ID}`)]);
  }
  rows.push([btn('← Kembali ke Detail Paket', `pkg_detail_${pkg.id}`)]);
  rows.push([btn('🏠 Dashboard Utama', 'view_home')]);

  await safeEdit(ctx, text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(rows)
  });
});

async function renderThemeSettings(ctx, isEdit = true) {
  const user = await getOrCreateUser(ctx.from);
  const current = getTheme(user.theme);

  const text =
    `${current.mark} <b>INTERFACE & PRIVACY STUDIO</b>\n\n` +
    `<blockquote>` +
    `${current.bullet} <b>Active Theme:</b> <code>${current.label}</code>\n` +
    `${current.bullet} <b>Privacy Spoiler:</b> <code>${user.privacy_mode ? 'ENABLED (Blurred)' : 'DISABLED'}</code>` +
    `</blockquote>\n\n` +
    `<blockquote expandable>` +
    `<b>PREVIEW & PENJELASAN FITUR</b>\n` +
    `• <b>Obsidian Minimal:</b> Desain bersih dengan expandable quote.\n` +
    `• <b>Cyber Telemetry:</b> Tabel monospace & bar progres terminal.\n` +
    `• <b>Editorial Gold:</b> Layout tipografi rapi berjarak lega.\n` +
    `• <b>Privacy Spoiler:</b> Menyamarkan nomor target dengan efek blur native Telegram.` +
    `</blockquote>`;

  const themeButtons = Object.values(THEMES).map((t) =>
    btn(t.id === user.theme ? `✓ ${t.label}` : t.label, `set_theme_${t.id}`, t.id === user.theme ? 'primary' : null)
  );

  const privacyLabel = user.privacy_mode ? 'Privacy Blur: ON (Tap to Disable)' : 'Privacy Blur: OFF (Tap to Enable)';

  const keyboard = Markup.inlineKeyboard([
    themeButtons,
    [btn(privacyLabel, 'toggle_privacy', user.privacy_mode ? 'success' : null)],
    [btn('← Back to Dashboard', 'view_home')]
  ]);

  if (isEdit) return safeEdit(ctx, text, { parse_mode: 'HTML', ...keyboard });
  return ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
}

bot.command('theme', (ctx) => renderThemeSettings(ctx, false));
bot.action('view_themes', async (ctx) => {
  await ctx.answerCbQuery();
  return renderThemeSettings(ctx, true);
});

bot.action(/^set_theme_(.+)$/, async (ctx) => {
  const themeId = ctx.match[1];
  if (!THEMES[themeId]) return;
  await updateUserPreferences(ctx.from.id, { theme: themeId });
  await ctx.answerCbQuery(`Theme switched to ${THEMES[themeId].label}`);
  return renderThemeSettings(ctx, true);
});

bot.action('toggle_privacy', async (ctx) => {
  const user = await getOrCreateUser(ctx.from);
  const nextState = user.privacy_mode ? 0 : 1;
  await updateUserPreferences(ctx.from.id, { privacy_mode: nextState });
  await ctx.answerCbQuery(nextState ? 'Privacy Spoiler ON' : 'Privacy Spoiler OFF');
  return renderThemeSettings(ctx, true);
});

async function renderHistory(ctx, isEdit = true) {
  const user = await getOrCreateUser(ctx.from);
  const t = getTheme(user.theme);
  const logs = await getCheckLogs(ctx.from.id, 10);

  const body = logs.length
    ? logs
        .map(
          (l) =>
            `${t.bullet} <code>${escapeHtml(l.phone_number)}</code> — <code>${l.status_summary}</code> [<code>${l.proxy_node}</code>]`
        )
        .join('\n')
    : '<i>Belum ada riwayat pengecekan.</i>';

  const text = `${t.mark} <b>RECENT TELEMETRY LOGS</b>\n\n<blockquote expandable>${body}</blockquote>`;
  const extra = { parse_mode: 'HTML', ...Markup.inlineKeyboard([[btn('← Back to Dashboard', 'view_home')]]) };

  if (isEdit) return safeEdit(ctx, text, extra);
  return ctx.reply(text, extra);
}

bot.command('history', (ctx) => renderHistory(ctx, false));
bot.action('view_history', async (ctx) => {
  await ctx.answerCbQuery();
  return renderHistory(ctx, true);
});

bot.action('view_support', async (ctx) => {
  await ctx.answerCbQuery();
  await safeEdit(
    ctx,
    `◈ <b>DIRECT SUPPORT</b>\n\n<blockquote>Butuh bantuan aktivasi paket Standard / Ultra secara manual? Hubungi operator secara langsung.</blockquote>`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.url('💬 Open Operator Chat', `tg://user?id=${ADMIN_ID}`)],
        [btn('← Back to Dashboard', 'view_home')]
      ])
    }
  );
});

bot.action('view_admin', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  await ctx.answerCbQuery();
  const stats = await getGlobalStats();
  const proxyActive = isDataImpulseConfigured();

  await safeEdit(
    ctx,
    `◈ <b>ADMIN CONSOLE (UPSTASH REDIS)</b>\n\n` +
      `<blockquote>` +
      `▪ <b>Total Users:</b> <code>${stats.totalUsers}</code>\n` +
      `▪ <b>Active VIP:</b> <code>${stats.activeVip}</code>\n` +
      `▪ <b>Total Checks:</b> <code>${stats.totalChecks}</code>\n` +
      `▪ <b>DataImpulse Gateway:</b> <code>${proxyActive ? 'CONNECTED (ROTATING)' : 'NOT SET'}</code>\n` +
      `▪ <b>Payment Gateway:</b> <code>IN PROGRESS</code>` +
      `</blockquote>\n\n` +
      `<blockquote expandable>` +
      `<b>ADMIN COMMANDS:</b>\n` +
      `• <code>/addvip USER_ID STANDARD 7</code>\n` +
      `• <code>/addvip USER_ID ULTRA 20</code>\n` +
      `• <code>/broadcast PESAN</code>` +
      `</blockquote>`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[btn('← Back to Dashboard', 'view_home')]])
    }
  );
});

bot.command('addvip', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const parts = ctx.message.text.trim().split(/\s+/);
  const uid = Number(parts[1]);
  let tier = 'STANDARD';
  let days = 0;

  if (parts.length >= 4) {
    tier = String(parts[2]).toUpperCase() === 'ULTRA' ? 'ULTRA' : 'STANDARD';
    days = Number(parts[3]);
  } else {
    days = Number(parts[2]);
  }

  if (!uid || !days) {
    return ctx.reply(
      'Format: <code>/addvip USER_ID STANDARD|ULTRA HARI</code>\nContoh: <code>/addvip 123456789 ULTRA 7</code>',
      { parse_mode: 'HTML' }
    );
  }

  const { expiry } = await activateVip(uid, days, tier, `${tier} · ${days} Hari`);
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
  for (const uid of stats.allUserIds) {
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
  const t = getTheme(user.theme);
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
        ...Markup.inlineKeyboard([[btn('⚡ Lihat Paket Standard & Ultra', 'store_tier_standard', 'primary')]])
      }
    );
  }

  const allowed = await consumeQuota(ctx.from.id, numbersList.length);
  if (!allowed) {
    return ctx.reply(
      `${t.mark} <b>DAILY QUOTA REACHED (3/3)</b>\n\n<blockquote>Kuota gratis Anda telah habis dan akan di-reset otomatis pukul <code>00:00 WIB</code>.</blockquote>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[btn('⚡ Upgrade Paket Premium', 'store_tier_standard', 'primary')]])
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
        ...Markup.inlineKeyboard([
          [btn('Re-Scan (New IP)', `rescan_${rawNum.replace(/[^\d]/g, '')}`, 'primary'), btn('Dashboard', 'view_home')]
        ])
      });
    } catch (err) {
      lastReaction = '❌';
      batchStats.error += 1;
      await ctx.reply(
        `${t.mark} <b>TELEMETRY ERROR</b>\n<blockquote>Target: <code>${escapeHtml(rawNum)}</code>\nDetail: <i>${escapeHtml(err.message)}</i></blockquote>`,
        { parse_mode: 'HTML' }
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

  const candidates = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /\d{7,15}/.test(l));

  if (candidates.length === 0) {
    return ctx.reply(
      `◈ <b>INVALID INPUT</b>\n<blockquote>Kirim nomor WhatsApp dengan kode negara, contoh: <code>6282298902274</code></blockquote>`,
      { parse_mode: 'HTML' }
    );
  }

  return processNumbers(ctx, candidates);
});

bot.action(/^rescan_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery('Rotating IP & Re-scanning...');
  return processNumbers(ctx, [ctx.match[1]], { forceFresh: true });
});

bot.catch((err, ctx) => {
  console.error(`Unhandled error for update ${ctx.update.update_id}:`, err);
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
