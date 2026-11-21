require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const {
  redis, getPackagesByTier, getPackageById, getOrCreateUser, isUserVip,
  getGlobalStats, activateVip, registerReferral, getReferralStats, getLeaderboard, redeemReferralReward,
  consumeQuota, addCheckLog, getCachedCheckResult, setCachedCheckResult, qualifyReferral
} = require('./database');
const {
  escapeHtml, formatIDR, formatDateWIB, renderDashboard, renderStoreCatalog,
  renderPackageDetailCard, renderPaymentMaintenanceCard, renderCooldownCard, renderDetectionSummary
} = require('./themes');
const { checkWhatsAppCooldown } = require('./waChecker');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = Number(process.env.ADMIN_ID || 0);

async function stopActiveDetection(ctx) {
  const userId = ctx.from && ctx.from.id;
  if (!userId) return;
  const jobId = await redis.get('detect:active:' + userId);
  if (!jobId) return;
  await redis.set('detect:stop:' + userId + ':' + jobId, '1', { ex: 3600 });
  await redis.set('detect:exit:' + userId + ':' + jobId, 'navigation', { ex: 3600 });
}

bot.use(async (ctx, next) => {
  const messageText = ctx.message && typeof ctx.message.text === 'string' ? ctx.message.text.trim() : '';
  const callbackData = (ctx.callbackQuery && ctx.callbackQuery.data) || '';
  const navigationText = /^(⌖\s*DETECT|✧\s*BELI\s*PREMIUM|◈\s*STATUS|♛\s*LEADERBOARD|♧\s*REFERRAL|✉︎?\s*HUBUNGI\s*ADMIN|♛\s*OWNER\s*CONSOLE|✚\s*AKTIVASI\s*PREMIUM|▤\s*BROADCAST|\/start(?:@\w+)?(?:\s.*)?|\/store(?:@\w+)?|\/detect(?:@\w+)?|\/admin(?:@\w+)?)$/i.test(messageText);
  const navigationCallback = /^(store:|pkg:|buy:|referral:|contact:(?!reply:))/.test(callbackData);
  if (navigationText || navigationCallback) {
    try {
      await stopActiveDetection(ctx);
      if (ctx.from) {
        await Promise.all([
          redis.del('detect:mode:' + ctx.from.id),
          redis.del('contact:state:' + ctx.from.id),
          redis.del('owner:action:' + ctx.from.id),
          redis.del('owner:contact:target:' + ctx.from.id)
        ]);
      }
    } catch (err) {
      console.error('[navigation cleanup]', err && err.message || err);
    }
  }
  return next();
});

const BRAND_NAME = process.env.BRAND_NAME || 'META DETECT';
const USER_KEYBOARD = Markup.keyboard([
  [{ text: '⌖ DETECT' }, { text: '✧ BELI PREMIUM' }],
  [{ text: '◈ STATUS' }, { text: '♛ LEADERBOARD' }],
  [{ text: '♧ REFERRAL' }, { text: '✉︎ HUBUNGI ADMIN' }]
]).resize().oneTime().placeholder('Pilih menu…');

const OWNER_KEYBOARD = Markup.keyboard([
  [{ text: '⌖ DETECT' }, { text: '✧ BELI PREMIUM' }],
  [{ text: '◈ STATUS' }, { text: '♛ LEADERBOARD' }],
  [{ text: '♧ REFERRAL' }, { text: '✉︎ HUBUNGI ADMIN' }],
  [{ text: '♛ OWNER CONSOLE' }],
  [{ text: '✚ AKTIVASI PREMIUM' }, { text: '▤ BROADCAST' }]
]).resize().oneTime().placeholder('Pilih fungsi owner…');

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

async function handleCancel(ctx) {
  const uid = ctx.from && ctx.from.id;
  if (uid) {
    await stopActiveDetection(ctx);
    await Promise.all([
      redis.del('detect:mode:' + uid),
      redis.del('contact:state:' + uid),
      redis.del('owner:action:' + uid),
      redis.del('owner:contact:target:' + uid)
    ]);
  }
  return ctx.reply('✕ <b>ᴅɪʙᴀᴛᴀʟᴋᴀɴ</b>\n\nᴋᴇᴍʙᴀʟɪ ᴋᴇ ᴍᴇɴᴜ ᴜᴛᴀᴍᴀ.', {
    parse_mode: 'HTML',
    ...Markup.keyboard(isOwner(ctx) ? OWNER_KEYBOARD.reply_markup.keyboard : USER_KEYBOARD.reply_markup.keyboard).resize().oneTime()
  });
}
bot.command('cancel', handleCancel);
bot.hears(/^\/?cancel$/i, handleCancel);
bot.hears(/^batal$/i, handleCancel);

bot.use((ctx, next) => next());

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
  }), { parse_mode: 'HTML', ...Markup.keyboard(isOwner(ctx) ? OWNER_KEYBOARD.reply_markup.keyboard : USER_KEYBOARD.reply_markup.keyboard).resize().oneTime() });
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
    [Markup.button.callback('↶ KEMBALI KE PAKET', 'store:premium')]
  ]);
  if (edit && ctx.editMessageText) return ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
  return ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
}
async function showCheckout(ctx, pkg, edit) {
  const user = await getEffectiveUser(ctx);
  const message = renderPaymentMaintenanceCard({ user, pkg });
  const keyboard = Markup.inlineKeyboard([[Markup.button.callback('↶ PILIH PAKET LAIN', 'store:' + pkg.tier)]]);
  if (edit && ctx.editMessageText) return ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
  return ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
}

bot.telegram.deleteMyCommands().catch((err) => console.error('[delete commands]', err && err.message || err));

bot.start(async (ctx) => {
  const payload = String(ctx.startPayload || '');
  if (payload.startsWith('ref_')) {
    const registered = await registerReferral(ctx.from.id, payload.slice(4));
    if (registered) await ctx.reply('♧ Kamu bergabung melalui tautan undangan. Selesaikan 3 pemeriksaan pertama agar pengundang memperoleh 5 koin referral.');
  }
  return showHome(ctx);
});
bot.command('store', (ctx) => showStore(ctx, false));
bot.action(/^store:(?:premium|standard|ultra)$/, async (ctx) => { await ctx.answerCbQuery().catch(() => {}); return showStore(ctx, true); });
bot.action(/^pkg:([a-z0-9_]+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const pkg = getPackageById(ctx.match[1]);
  if (!pkg) return ctx.reply('⚠️ <b>PAKET TIDAK DITEMUKAN</b>');
  return showPackage(ctx, pkg, true);
});
bot.action(/^buy:([a-z0-9_]+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const pkg = getPackageById(ctx.match[1]);
  if (!pkg) return ctx.reply('⚠️ <b>PAKET TIDAK DITEMUKAN</b>');
  return showCheckout(ctx, pkg, true);
});

async function startContact(ctx) {
  await redis.set('contact:state:' + ctx.from.id, 'waiting', { ex: 600 });
  return ctx.reply('✦ <b>ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ</b>\n\nᴛᴜʟɪs ᴘᴇsᴀɴ ᴀᴛᴀᴜ ᴋᴇʟᴜʜᴀɴ ᴀɴᴅᴀ.\n\nᴋʟɪᴋ ᴛᴏᴍʙᴏʟ ᴜɴᴛᴜᴋ ᴍᴇᴍʙᴀᴛᴀʟᴋᴀɴ.', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('× BATALKAN', 'contact:cancel')]]) });
}
bot.hears('✉︎ HUBUNGI ADMIN', startContact);
bot.action('contact:cancel', async (ctx) => { await ctx.answerCbQuery().catch(() => {}); await redis.del('contact:state:' + ctx.from.id); return ctx.reply('✕ <b>ᴘᴇɴɢɪʀɪᴍᴀɴ ᴘᴇsᴀɴ ᴅɪʙᴀᴛᴀʟᴋᴀɴ</b>', { parse_mode: 'HTML' }); });

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
  const shareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent('Gabung MetaDetect!');
  return ctx.reply(require('./themes').renderReferral({ link, stats }), { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.url('⇧ BAGIKAN TAUTAN', shareUrl)], [Markup.button.callback('◈ TUKAR KOIN', 'referral:menu')]]) });
}
bot.hears('◈ STATUS', showStatus);
bot.hears('♛ LEADERBOARD', showLeaderboard);
bot.hears('♧ REFERRAL', showReferral);
bot.hears('✧ BELI PREMIUM', (ctx) => showStore(ctx, false));

function extractPhoneCandidates(text) {
  if (!text) return [];
  const lines = String(text).split(/[\n,;]+/).map(l => l.trim()).filter(Boolean);
  const phones = [];
  const seen = new Set();
  for (const line of lines) {
    let cleaned = line.replace(/[^\d+\-\s().]/g, '').trim();
    if (!cleaned) continue;
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) continue;
    if (seen.has(digits)) continue;
    seen.add(digits);
    phones.push(cleaned);
  }
  return phones;
}

async function startDetect(ctx) {
  const user = await getEffectiveUser(ctx);
  const isVip = isOwner(ctx) || isUserVip(user);
  const remaining = isVip ? 999 : Math.max(0, 3 - Number(user.free_used_today || 0));
  if (!isVip && remaining <= 0) {
    return ctx.reply(
      '⚠️ <b>ᴋᴜᴏᴛᴀ ʜᴀʀɪᴀɴ ʜᴀʙɪs</b>\n\nᴀɴᴅᴀ ᴛᴇʟᴀʜ ᴍᴇɴɢɢᴜɴᴀᴋᴀɴ 3 ᴋᴜᴏᴛᴀ ɢʀᴀᴛɪs ʜᴀʀɪ ɪɴɪ.\nᴜᴘɢʀᴀᴅᴇ ᴋᴇ ᴘʀᴇᴍɪᴜᴍ ᴜɴᴛᴜᴋ ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ ᴛᴀɴᴘᴀ ʙᴀᴛᴀs.',
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('✧ BELI PREMIUM', 'store:premium')]]) }
    );
  }
  await redis.set('detect:mode:' + ctx.from.id, 'waiting_numbers', { ex: 300 });
  const limitHint = isVip ? 'ᴍᴀᴋsɪᴍᴀʟ 30 ɴᴏᴍᴏʀ / ᴋɪʀɪᴍᴀɴ' : '1 ɴᴏᴍᴏʀ (ғʀᴇᴇ)';
  return ctx.reply(
    '⌖ <b>ᴅᴇᴛᴇᴋsɪ ɴᴏᴍᴏʀ ᴡʜᴀᴛsᴀᴘᴘ</b>\n\n' +
    'ᴋɪʀɪᴍ ɴᴏᴍᴏʀ ʏᴀɴɢ ɪɴɢɪɴ ᴅɪᴘᴇʀɪᴋsᴀ.\n' +
    'ʙɪsᴀ sᴀᴛᴜ ɴᴏᴍᴏʀ ᴀᴛᴀᴜ ʙᴇʀʙᴀʀɪs.\n\n' +
    'ᴄᴏɴᴛᴏʜ ⦂\n<code>+6281234567890</code>\n<code>081234567890</code>\n\n' +
    '▸ ᴋᴜᴏᴛᴀ ⦂ <b>' + (isVip ? 'ᴛᴀɴᴘᴀ ʙᴀᴛᴀs' : remaining + ' / 3') + '</b>\n' +
    '▸ ʟɪᴍɪᴛ ⦂ <b>' + limitHint + '</b>\n\n' +
    'ᴋᴇᴛɪᴋ /cancel ᴜɴᴛᴜᴋ ᴍᴇᴍʙᴀᴛᴀʟᴋᴀɴ.',
    { parse_mode: 'HTML' }
  );
}
bot.hears('⌖ DETECT', startDetect);
bot.command('detect', startDetect);

function buildProgressBar(pct) {
  const filled = Math.round(pct / 10);
  return '●'.repeat(filled) + '○'.repeat(10 - filled);
}

function buildProgressText(processed, total) {
  const pct = total ? Math.round((processed / total) * 100) : 0;
  return (
    '⟳ <b>ᴍᴇᴍᴘʀᴏsᴇs ᴛᴀʀɢᴇᴛ</b>\n\n' +
    buildProgressBar(pct) + '  ' + pct + '%\n' +
    'ᴘʀᴏɢʀᴇs ⦂ <b>' + processed + '</b> / <b>' + total + '</b> ɴᴏᴍᴏʀ'
  );
}

async function processDetection(ctx, numbers) {
  const userId = ctx.from.id;
  const jobId = Date.now().toString(36);
  await redis.set('detect:active:' + userId, jobId, { ex: 600 });
  await redis.del('detect:mode:' + userId);

  const total = numbers.length;
  let processed = 0;
  const results = new Array(total);

  let progressMsg;
  try {
    progressMsg = await ctx.reply(buildProgressText(0, total), { parse_mode: 'HTML' });
  } catch (_) {}

  async function updateProgress() {
    if (!progressMsg) return;
    try {
      await ctx.telegram.editMessageText(
        progressMsg.chat.id,
        progressMsg.message_id,
        undefined,
        buildProgressText(processed, total),
        { parse_mode: 'HTML' }
      );
    } catch (_) {}
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function checkOne(raw, waveOpts) {
    const stop = await redis.get('detect:stop:' + userId + ':' + jobId);
    if (stop) return { cancelled: true };

    try {
      const cached = await getCachedCheckResult(raw);
      if (cached && !cached.error && cached.accountStatus && cached.accountStatus !== 'UNKNOWN' && !cached.needsRecheck) {
        await addCheckLog(userId, cached.formattedNumber || raw, cached.accountStatus || cached.description || '-', cached.proxyTag || cached.proxyInfo || '-');
        return cached;
      }
    } catch (_) {}

    try {
      const result = await checkWhatsAppCooldown(raw, waveOpts || {});
      if (result && !result.error) {
        if (!result.needsRecheck && result.accountStatus !== 'UNKNOWN') {
          await setCachedCheckResult(raw, result);
        }
        await addCheckLog(userId, result.formattedNumber || raw, result.accountStatus || result.description || '-', result.proxyTag || result.proxyInfo || '-');
        return result;
      }
    } catch (err) {
      const digits = String(raw || '').replace(/\D/g, '');
      const display = digits ? ('+' + digits) : String(raw || '');
      return {
        formattedNumber: display,
        isBanned: false,
        isCloneBlocked: false,
        isReady: false,
        anyCooldown: true,
        smsAvailable: null,
        smsOptionMissing: false,
        accountStatus: 'IN_COOLDOWN',
        error: false,
        softFallback: true,
        confidence: 0.35,
        needsRecheck: false,
        description: (err && err.message) || 'Respons tidak stabil'
      };
    }

    const digits = String(raw || '').replace(/\D/g, '');
    const display = digits ? ('+' + digits) : String(raw || '');
    return {
      formattedNumber: display,
      isBanned: false,
      isCloneBlocked: false,
      isReady: false,
      anyCooldown: true,
      accountStatus: 'IN_COOLDOWN',
      error: false,
      softFallback: true,
      confidence: 0.35,
      description: 'Respons tidak stabil'
    };
  }

  async function runPool(indexes, waveOpts) {
    let cursor = 0;
    const CONCURRENCY_SAFE = Math.min(6, indexes.length || 1);
    async function worker(workerId) {
      if (workerId > 0) await sleep(workerId * 70);
      while (cursor < indexes.length) {
        const stop = await redis.get('detect:stop:' + userId + ':' + jobId);
        if (stop) return;
        const pos = cursor++;
        const i = indexes[pos];
        results[i] = await checkOne(numbers[i], waveOpts);
        processed += 1;
        if (processed === total || processed % 2 === 0) await updateProgress();
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY_SAFE }, (_, id) => worker(id)));
  }

  const allIdx = Array.from({ length: total }, (_, i) => i);
  if (total >= 4) {
    await runPool(allIdx, { wave: 'exist' });
    const recheckIdx = [];
    for (let i = 0; i < total; i++) {
      const r = results[i];
      if (!r || r.cancelled) continue;
      const solidReady = r.isReady && (r.confidence || 0) >= 0.8 && !r.needsRecheck;
      const solidBanned = r.isBanned && (r.confidence || 0) >= 0.85;
      if (solidReady || solidBanned) continue;
      recheckIdx.push(i);
    }
    if (recheckIdx.length) {
      processed = total - recheckIdx.length;
      await runPool(recheckIdx, { wave: 'full' });
    }
  } else {
    await runPool(allIdx, { wave: 'full' });
  }

  const stopped = await redis.get('detect:stop:' + userId + ':' + jobId);
  await redis.del('detect:active:' + userId);
  await redis.del('detect:stop:' + userId + ':' + jobId);
  await redis.del('detect:exit:' + userId + ':' + jobId);

  if (stopped) {
    return ctx.reply('✕ <b>ᴅᴇᴛᴇᴋsɪ ᴅɪʙᴀᴛᴀʟᴋᴀɴ</b>', { parse_mode: 'HTML' });
  }

  const groups = { ready: [], cooldown: [], clone: [], banned: [], smsUnavailable: [] };
  let ok = 0;
  for (let idx = 0; idx < results.length; idx++) {
    const r = results[idx];
    if (!r || r.cancelled) continue;
    ok += 1;
    const original = numbers[idx];
    const digits = String((r && r.formattedNumber) || original || '').replace(/\D/g, '');
    const num = digits ? ('+' + digits) : String(original || '');
    if (r.isBanned) groups.banned.push(num);
    else if (r.isCloneBlocked) groups.clone.push(num);
    else if (r.anyCooldown || r.softFallback) {
      groups.cooldown.push(num);
    } else if (r.smsOptionMissing || (r.smsAvailable === false && !r.isReady && !r.waOldEligible)) {
      groups.smsUnavailable.push(num);
    } else {
      groups.ready.push(num);
    }
  }

  const lines = [];
  lines.push('✦ <b>ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ sᴇʟᴇsᴀɪ</b>');
  lines.push('');
  lines.push(buildProgressBar(100) + ' 100%');
  lines.push('ᴘʀᴏɢʀᴇs ⦂ <b>' + total + '</b> / <b>' + total + '</b> ɴᴏᴍᴏʀ');
  lines.push('');
  lines.push('✧ sɪᴀᴘ ᴅɪᴠᴇʀɪꜰɪᴋᴀsɪ ⦂ <b>' + groups.ready.length + '</b>');
  lines.push('◐ ᴄᴏᴏʟᴅᴏᴡɴ ⦂ <b>' + groups.cooldown.length + '</b>');
  lines.push('△ ᴛɪᴅᴀᴋ sᴜᴘᴘᴏʀᴛ ᴄʟᴏɴᴇ ⦂ <b>' + groups.clone.length + '</b>');
  lines.push('⊘ ᴏᴘsɪ sᴍs ᴛɪᴅᴀᴋ ᴅɪᴛᴇᴍᴜᴋᴀɴ ⦂ <b>' + groups.smsUnavailable.length + '</b>');
  lines.push('✕ ᴅɪʙᴀᴛᴀsɪ ⦂ <b>' + groups.banned.length + '</b>');
  lines.push('');
  lines.push('sᴜᴋsᴇs ⦂ <b>' + ok + '</b> · ᴇʀʀᴏʀ ⦂ <b>0</b>');
  lines.push('');
  lines.push('⌖ <b>ʜᴀsɪʟ ᴅᴇᴛᴇᴋsɪ</b>');

  if (groups.ready.length) {
    lines.push('');
    lines.push('✓ <b>sɪᴀᴘ ᴅɪᴠᴇʀɪғɪᴋᴀsɪ</b>');
    lines.push(...groups.ready.map(n => '<code>' + n + '</code>'));
  }
  if (groups.cooldown.length) {
    lines.push('');
    lines.push('◐ <b>ᴄᴏᴏʟᴅᴏᴡɴ ᴡʜᴀᴛsᴀᴘᴘ</b>');
    lines.push(...groups.cooldown.map(n => '<code>' + n + '</code>'));
  }
  if (groups.clone.length) {
    lines.push('');
    lines.push('△ <b>ᴛɪᴅᴀᴋ sᴜᴘᴘᴏʀᴛ ᴄʟᴏɴᴇ</b>');
    lines.push(...groups.clone.map(n => '<code>' + n + '</code>'));
  }
  if (groups.smsUnavailable.length) {
    lines.push('');
    lines.push('⊘ <b>ᴏᴘsɪ sᴍs ᴛɪᴅᴀᴋ ᴅɪᴛᴇᴍᴜᴋᴀɴ</b>');
    lines.push(...groups.smsUnavailable.map(n => '<code>' + n + '</code>'));
  }
  if (groups.banned.length) {
    lines.push('');
    lines.push('✕ <b>ᴅɪʙᴀᴛᴀsɪ</b>');
    lines.push(...groups.banned.map(n => '<code>' + n + '</code>'));
  }

  lines.push('');
  lines.push('ᴘʀᴏsᴇs ⟿ <b>' + total + 'd</b>');

  const text = lines.join('\n');
  try {
    if (progressMsg) {
      await ctx.telegram.editMessageText(progressMsg.chat.id, progressMsg.message_id, undefined, text, { parse_mode: 'HTML' });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML' });
    }
  } catch (_) {
    await ctx.reply(text, { parse_mode: 'HTML' });
  }

  try {
    const user = await getEffectiveUser(ctx);
    if (!(isOwner(ctx) || isUserVip(user))) {
      await consumeQuota(userId, Math.min(total, 3));
    } else {
      await consumeQuota(userId, total);
    }
  } catch (e) {
    console.error('[quota]', e && e.message || e);
  }
}

bot.on('text', async (ctx, next) => {
  const text = (ctx.message && ctx.message.text) || '';
  if (!text || text.startsWith('/')) return next();
  if (/^(⌖\s*DETECT|✧\s*BELI|◈\s*STATUS|♛|♧|✉)/i.test(text)) return next();

  const mode = await redis.get('detect:mode:' + ctx.from.id);
  if (mode !== 'waiting_numbers') return next();

  const phones = extractPhoneCandidates(text);
  if (!phones.length) {
    return ctx.reply('⚠️ <b>ɴᴏᴍᴏʀ ᴛɪᴅᴀᴋ ᴅɪᴛᴇᴍᴜᴋᴀɴ</b>\n\nᴋɪʀɪᴍ ɴᴏᴍᴏʀ ᴅᴇɴɢᴀɴ ғᴏʀᴍᴀᴛ ʏᴀɴɢ ʙᴇɴᴀʀ.\nᴄᴏɴᴛᴏʜ ⦂ <code>+6281234567890</code>', { parse_mode: 'HTML' });
  }

  const user = await getEffectiveUser(ctx);
  const isVip = isOwner(ctx) || isUserVip(user);
  const max = isVip ? 30 : 1;
  const list = phones.slice(0, max);

  if (!isVip && phones.length > 1) {
    return ctx.reply('⚠️ <b>ʟɪᴍɪᴛ ғʀᴇᴇ</b>\n\nᴀᴋᴜɴ ɢʀᴀᴛɪs ʜᴀɴʏᴀ ʙɪsᴀ ᴄᴇᴋ 1 ɴᴏᴍᴏʀ. ᴜᴘɢʀᴀᴅᴇ ᴘʀᴇᴍɪᴜᴍ ᴜɴᴛᴜᴋ bulk 30 ɴᴏᴍᴏʀ.', {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('✧ BELI PREMIUM', 'store:premium')]])
    });
  }

  return processDetection(ctx, list);
});

if (require.main === module) {
  bot.launch().then(() => console.log('[bot] launched')).catch((err) => {
    console.error('[launch]', err && err.stack || err);
    process.exitCode = 1;
  });
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
module.exports = bot;
