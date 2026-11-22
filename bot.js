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

function styledCallback(text, data, style) {
  const btn = Markup.button.callback(text, data);
  if (style) btn.style = style;
  return btn;
}

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
  try {
    const user = await getEffectiveUser(ctx);
    return await ctx.reply(renderDashboard({
      user,
      isVip: isOwner(ctx) || isUserVip(user),
      isOwner: isOwner(ctx),
      brandName: BRAND_NAME
    }), {
      parse_mode: 'HTML',
      ...Markup.keyboard(isOwner(ctx) ? OWNER_KEYBOARD.reply_markup.keyboard : USER_KEYBOARD.reply_markup.keyboard).resize().oneTime()
    });
  } catch (err) {
    console.error('[showHome]', err && err.stack || err);
    return ctx.reply('✕ <b>ɢᴀɢᴀʟ ᴍᴇᴍᴜᴀᴛ ᴍᴇɴᴜ</b>\n\n<blockquote>ᴄᴏʙᴀ /start ʟᴀɢɪ</blockquote>', { parse_mode: 'HTML' }).catch(() => {});
  }
}

function buildStoreKeyboard() {
  const packages = getPackagesByTier('premium');
  const rows = [];
  for (let i = 0; i < packages.length; i += 2) {
    rows.push(packages.slice(i, i + 2).map((pkg) =>
      styledCallback(pkg.durationLabel + ' · ' + formatIDR(pkg.price), 'pkg:' + pkg.id, 'primary')
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
    [styledCallback('✓ BELI · ' + formatIDR(pkg.price), 'buy:' + pkg.id, 'success')],
    [styledCallback('↶ KEMBALI', 'store:premium', 'danger')]
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

bot.catch((err, ctx) => {
  console.error('[bot.catch]', err && err.stack || err);
  try {
    if (ctx && ctx.reply) {
      ctx.reply('✕ <b>ᴛᴇʀᴊᴀᴅɪ ᴋᴇsᴀʟᴀʜᴀɴ</b>\n\n<blockquote>sɪʟᴀᴋᴀɴ ᴄᴏʙᴀ ʟᴀɢɪ /start</blockquote>', { parse_mode: 'HTML' }).catch(() => {});
    }
  } catch (_) {}
});

bot.start(async (ctx) => {
  try {
    const payload = String(ctx.startPayload || '');
    if (payload.startsWith('ref_')) {
      try {
        const registered = await registerReferral(ctx.from.id, payload.slice(4));
        if (registered) {
          await ctx.reply('♧ Kamu bergabung melalui tautan undangan. Selesaikan 3 pemeriksaan pertama agar pengundang memperoleh 5 koin referral.');
        }
      } catch (refErr) {
        console.error('[start/ref]', refErr && refErr.message || refErr);
      }
    }
    return await showHome(ctx);
  } catch (err) {
    console.error('[start]', err && err.stack || err);
    return ctx.reply('✕ <b>ɢᴀɢᴀʟ ᴍᴇᴍᴜᴀᴛ ᴅᴀsʜʙᴏᴀʀᴅ</b>\n\n<blockquote>ᴄᴏʙᴀ ᴋᴇᴍʙᴀʟɪ /start</blockquote>', { parse_mode: 'HTML' }).catch(() => {});
  }
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
  return ctx.reply(require('./themes').renderReferral({ link, stats }), { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.url('⇧ BAGIKAN TAUTAN', shareUrl)], [styledCallback('◈ TUKAR KOIN', 'referral:menu', 'primary')]]) });
}
bot.hears('◈ STATUS', showStatus);
bot.hears('♛ LEADERBOARD', showLeaderboard);
bot.hears('♧ REFERRAL', showReferral);
bot.hears('✧ BELI PREMIUM', (ctx) => showStore(ctx, false));

function extractPhoneCandidates(text) {
  if (!text) return [];
  const raw = String(text);
  const phones = [];
  const seen = new Set();
  const pattern = /(?:\+|00)?[\d][\d\s\-().]{6,20}\d/g;
  let match;
  while ((match = pattern.exec(raw)) !== null) {
    let token = match[0].trim();
    token = token.replace(/[^\d+]+$/g, '').replace(/^[^\d+]+/g, '');
    const hasPlus = token.startsWith('+') || token.startsWith('00');
    let digits = token.replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.length < 8 || digits.length > 15) continue;
    if (digits.length <= 4) continue;
    if (/^(19|20)\d{2}$/.test(digits)) continue;
    if (seen.has(digits)) continue;
    seen.add(digits);
    phones.push(hasPlus || digits.length >= 10 ? ('+' + digits) : digits);
  }
  if (!phones.length) {
    const lines = raw.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const digits = line.replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 15) continue;
      if (seen.has(digits)) continue;
      seen.add(digits);
      phones.push(line.includes('+') ? ('+' + digits) : digits);
    }
  }
  return phones;
}

async function startDetect(ctx) {
  const user = await getEffectiveUser(ctx);
  const isVip = isOwner(ctx) || isUserVip(user);
  const remaining = isVip ? 999 : Math.max(0, 3 - Number(user.free_used_today || 0));
  if (!isVip && remaining <= 0) {
    return ctx.reply(
      '✦ <b>ᴋᴜᴏᴛᴀ ʜᴀʀɪᴀɴ ʜᴀʙɪs</b>\n\n<blockquote>ᴀɴᴅᴀ ᴛᴇʟᴀʜ ᴍᴇɴɢɢᴜɴᴀᴋᴀɴ 3 ᴋᴜᴏᴛᴀ ɢʀᴀᴛɪs ʜᴀʀɪ ɪɴɪ.\nᴜᴘɢʀᴀᴅᴇ ᴋᴇ ᴘʀᴇᴍɪᴜᴍ ᴜɴᴛᴜᴋ ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ ᴛᴀɴᴘᴀ ʙᴀᴛᴀs.</blockquote>',
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([[styledCallback('✧ BELI PREMIUM', 'store:premium', 'success')]]) }
    );
  }
  await redis.set('detect:mode:' + ctx.from.id, 'waiting_numbers', { ex: 300 });
  const limitHint = isVip ? 'ᴍᴀᴋsɪᴍᴀʟ 30 ɴᴏᴍᴏʀ / ᴋɪʀɪᴍᴀɴ' : '1 ɴᴏᴍᴏʀ (ғʀᴇᴇ)';
  return ctx.reply(
    '⌖ <b>ᴅᴇᴛᴇᴋsɪ ɴᴏᴍᴏʀ ᴡʜᴀᴛsᴀᴘᴘ</b>\n\n' +
    'ᴋɪʀɪᴍ ɴᴏᴍᴏʀ ᴛᴀʀɢᴇᴛ ʏᴀɴɢ ɪɴɢɪɴ ᴅɪᴘᴇʀɪᴋsᴀ.\n' +
    '· ᴘɪsᴀʜᴋᴀɴ ᴅᴇɴɢᴀɴ ʙᴀʀɪs ʙᴀʀᴜ ᴀᴛᴀᴜ ᴋᴏᴍᴀ\n' +
    '· sɪsᴛᴇᴍ ᴏᴛᴏᴍᴀᴛɪs ᴍᴇɴɢᴇᴋsᴛʀᴀᴋ ᴀɴɢᴋᴀ\n\n' +
    'ᴄᴏɴᴛᴏʜ ⦂\n' +
    '<code>+6281234567890</code>\n' +
    '<code>+6281234567890 (Low) · Jul 2024</code>\n\n' +
    '▸ ᴋᴜᴏᴛᴀ ⦂ <b>' + (isVip ? 'ᴛᴀɴᴘᴀ ʙᴀᴛᴀs' : remaining + ' / 3') + '</b>\n' +
    '▸ ʟɪᴍɪᴛ ⦂ <b>' + limitHint + '</b>\n\n' +
    'ᴋʟɪᴋ ᴅɪ ʙᴀᴡᴀʜ ɪɴɪ ᴜɴᴛᴜᴋ ᴍᴇᴍʙᴀᴛᴀʟᴋᴀɴ.',
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [styledCallback('Batal', 'detect:cancel_prompt', 'danger')]
      ])
    }
  );
}
bot.hears('⌖ DETECT', startDetect);
bot.command('detect', startDetect);
bot.action('detect:cancel_prompt', async (ctx) => {
  await ctx.answerCbQuery('Dibatalkan').catch(() => {});
  await redis.del('detect:mode:' + ctx.from.id);
  return ctx.reply('✕ <b>ᴅᴇᴛᴇᴋsɪ ᴅɪʙᴀᴛᴀʟᴋᴀɴ</b>', { parse_mode: 'HTML' });
});

function buildProgressBar(pct) {
  const filled = Math.round(pct / 10);
  return '●'.repeat(filled) + '○'.repeat(10 - filled);
}

function formatCooldownSmallCaps(seconds) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  if (sec <= 0) return '0ᴅᴇᴛɪᴋ';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts = [];
  if (h > 0) parts.push(h + 'ᴊᴀᴍ');
  if (m > 0) parts.push(m + 'ᴍᴇɴɪᴛ');
  if (s > 0 || parts.length === 0) parts.push(s + 'ᴅᴇᴛɪᴋ');
  return parts.join(' ');
}

function buildProgressText(processed, total, stageLabel) {
  const safeTotal = total > 0 ? total : 1;
  const safeProcessed = Math.min(Math.max(0, processed), safeTotal);
  const pct = Math.round((safeProcessed / safeTotal) * 100);
  const title = stageLabel || 'ᴍᴇᴍᴘʀᴏsᴇs ᴛᴀʀɢᴇᴛ';
  return (
    '⟳ <b>' + title + '</b>\n\n' +
    buildProgressBar(pct) + '  ' + pct + '%\n' +
    'ᴘʀᴏɢʀᴇs ⦂ <b>' + safeProcessed + '</b> / <b>' + safeTotal + '</b> ɴᴏᴍᴏʀ'
  );
}

async function processDetection(ctx, numbers) {
  const userId = ctx.from.id;
  const jobId = Date.now().toString(36);
  await redis.set('detect:active:' + userId, jobId, { ex: 600 });
  await redis.del('detect:mode:' + userId);
  const total = numbers.length;
  const results = new Array(total);
  let progressMsg;
  let currentStageLabel = 'ᴍᴇᴍᴘʀᴏsᴇs ᴛᴀʀɢᴇᴛ';
  let stageProcessed = 0;
  let stageTotal = total;
  try {
    progressMsg = await ctx.reply(buildProgressText(0, stageTotal, currentStageLabel), { parse_mode: 'HTML' });
  } catch (_) {}
  async function updateProgress() {
    if (!progressMsg) return;
    try {
      await ctx.telegram.editMessageText(progressMsg.chat.id, progressMsg.message_id, undefined, buildProgressText(stageProcessed, stageTotal, currentStageLabel), { parse_mode: 'HTML' });
    } catch (_) {}
  }
  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
  async function checkOne(raw, waveOpts) {
    const stop = await redis.get('detect:stop:' + userId + ':' + jobId);
    if (stop) return { cancelled: true };
    try {
      const opts = Object.assign({ skipSticky: true }, waveOpts || {});
      let result = await checkWhatsAppCooldown(raw, opts);
      if (result && !result.cancelled && (result.softFallback || result.needsRecheck || (Number(result.confidence) || 0) < 0.55)) {
        if ((waveOpts && waveOpts.wave) !== 'full') {
          try {
            const retry = await checkWhatsAppCooldown(raw, { wave: 'full', skipSticky: true });
            if (retry && !retry.error && (Number(retry.confidence) || 0) >= (Number(result.confidence) || 0)) result = retry;
          } catch (_) {}
        }
      }
      if (result && !result.error) {
        await addCheckLog(userId, result.formattedNumber || raw, result.accountStatus || result.description || '-', result.proxyTag || result.proxyInfo || '-');
        return result;
      }
    } catch (err) {
      try {
        const retry = await checkWhatsAppCooldown(raw, { wave: 'full', skipSticky: true });
        if (retry && !retry.error) {
          await addCheckLog(userId, retry.formattedNumber || raw, retry.accountStatus || '-', retry.proxyTag || '-');
          return retry;
        }
      } catch (_) {}
      const digits = String(raw || '').replace(/\D/g, '');
      return { formattedNumber: digits ? ('+' + digits) : String(raw || ''), isBanned: false, isCloneBlocked: false, isReady: false, anyCooldown: false, accountStatus: 'UNKNOWN', error: false, softFallback: true, confidence: 0.3, needsRecheck: true, description: 'Respons tidak stabil · coba ulang' };
    }
    const digits = String(raw || '').replace(/\D/g, '');
    return { formattedNumber: digits ? ('+' + digits) : String(raw || ''), isBanned: false, isCloneBlocked: false, isReady: false, anyCooldown: false, accountStatus: 'UNKNOWN', error: false, softFallback: true, confidence: 0.3, description: 'Respons tidak stabil · coba ulang' };
  }
  async function runPool(indexes, waveOpts) {
    let cursor = 0;
    stageProcessed = 0;
    stageTotal = indexes.length || 1;
    let conc;
    if (indexes.length >= 20) conc = 5;
    else if (indexes.length >= 12) conc = 6;
    else if (indexes.length >= 6) conc = 7;
    else conc = Math.min(8, indexes.length || 1);
    const CONCURRENCY_SAFE = Math.max(1, conc);
    async function worker(workerId) {
      if (workerId > 0) await sleep(workerId * 70);
      while (cursor < indexes.length) {
        const stop = await redis.get('detect:stop:' + userId + ':' + jobId);
        if (stop) return;
        const pos = cursor++;
        if (pos >= indexes.length) return;
        const i = indexes[pos];
        results[i] = await checkOne(numbers[i], waveOpts);
        stageProcessed += 1;
        if (stageProcessed === 1 || stageProcessed === stageTotal || stageProcessed % 2 === 0) await updateProgress();
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY_SAFE }, (_, id) => worker(id)));
    stageProcessed = stageTotal;
    await updateProgress();
  }
  const allIdx = Array.from({ length: total }, (_, i) => i);
  if (total >= 4) {
    currentStageLabel = 'ᴛᴀʜᴀᴘ 1/2 · sᴄᴀɴ ᴄᴇᴘᴀᴛ';
    await runPool(allIdx, { wave: 'exist' });
    const needFull = [];
    for (let i = 0; i < total; i++) {
      const r = results[i];
      if (!r || r.cancelled) continue;
      const conf = Number(r.confidence) || 0;
      const clearLiveCooldown = r.anyCooldown && r.primaryTimer && r.primaryTimer.rawSeconds > 0 && conf >= 0.82;
      const clearBan = r.isBanned && conf >= 0.88;
      const clearReady = r.isReady && (r.existClear || conf >= 0.84) && !r.anyCooldown;
      const clearClone = (r.isCloneBlocked || r.isSecurityBlock) && conf >= 0.85;
      if (clearLiveCooldown || clearBan || clearReady || clearClone) continue;
      needFull.push(i);
    }
    if (needFull.length) {
      currentStageLabel = 'ᴛᴀʜᴀᴘ 2/2 · ᴠᴇʀɪғɪᴋᴀsɪ ᴅᴀʟᴀᴍ';
      await runPool(needFull, { wave: 'full' });
    } else {
      currentStageLabel = 'ᴛᴀʜᴀᴘ 2/2 · sᴇʟᴇsᴀɪ';
      stageProcessed = total;
      stageTotal = total;
      await updateProgress();
    }
  } else {
    currentStageLabel = total > 1 ? 'ᴛᴀʜᴀᴘ 1/1 · ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ' : 'ᴍᴇᴍᴘʀᴏsᴇs ᴛᴀʀɢᴇᴛ';
    await runPool(allIdx, { wave: 'full' });
  }
  const stopped = await redis.get('detect:stop:' + userId + ':' + jobId);
  await redis.del('detect:active:' + userId);
  await redis.del('detect:stop:' + userId + ':' + jobId);
  if (stopped) return ctx.reply('✕ <b>ᴅᴇᴛᴇᴋsɪ ᴅɪʙᴀᴛᴀʟᴋᴀɴ</b>', { parse_mode: 'HTML' });

  const groups = { ready: [], cooldown: [], clone: [], restricted: [], other: [] };
  for (const r of results) {
    if (!r || r.cancelled) continue;
    const num = r.formattedNumber || '-';
    if (r.isBanned === true || r.accountStatus === 'BANNED') {
      groups.restricted.push('· ' + num + ' ⦂ ᴛɪᴅᴀᴋ ᴅᴀᴘᴀᴛ ᴅɪᴅᴀꜰᴛᴀʀᴋᴀɴ');
    } else if (r.isCloneBlocked || r.isSecurityBlock) {
      const sec = r.secondaryPath || (
        (r.deviceName || r.waOldEligible) ? 'device' :
        ((Number(r.secondarySeconds) || (r.primaryTimer && r.primaryTimer.rawSeconds) || 0) > 0 ? 'cooldown' :
        (r.isReady ? 'ready' : null))
      );
      let label = 'sɪᴀᴘ ᴍᴇɴᴇʀɪᴍᴀ sᴍs';
      let sortSecs = 0;
      if (sec === 'device') {
        label = 'ᴘᴇʀᴀɴɢᴋᴀᴛ ᴛᴇʀᴅᴀꜰᴛᴀʀ';
        sortSecs = -1;
      } else if (sec === 'cooldown') {
        let secs = Number(r.secondarySeconds) || 0;
        if (!secs && r.primaryTimer && r.primaryTimer.rawSeconds > 0) secs = Number(r.primaryTimer.rawSeconds) || 0;
        if (!secs && r.channels && r.channels.sms && r.channels.sms.rawSeconds > 0) secs = Number(r.channels.sms.rawSeconds) || 0;
        label = secs > 0 ? formatCooldownSmallCaps(secs) : 'ᴄᴏᴏʟᴅᴏᴡɴ';
        sortSecs = secs > 0 ? secs : 999999;
      } else if (sec === 'ready') {
        label = 'sɪᴀᴘ ᴍᴇɴᴇʀɪᴍᴀ sᴍs';
        sortSecs = 0;
      }
      groups.clone.push({ line: '· ' + num + ' ⦂ ' + label, secs: sortSecs });
    } else if (r.isReady && !r.anyCooldown) {
      if (r.deviceName || r.waOldEligible || r.accountStatus === 'REGISTERED_ON_DEVICE') {
        groups.ready.push({ line: '· ' + num + ' ⦂ ᴘᴇʀᴀɴɢᴋᴀᴛ ᴛᴇʀᴅᴀꜰᴛᴀʀ', rank: 0 });
      } else {
        groups.ready.push({ line: '· ' + num + ' ⦂ sɪᴀᴘ ᴍᴇɴᴇʀɪᴍᴀ sᴍs', rank: 1 });
      }
    } else if (r.anyCooldown || r.accountStatus === 'IN_COOLDOWN') {
      let secs = 0;
      if (r.primaryTimer && r.primaryTimer.rawSeconds > 0) secs = Number(r.primaryTimer.rawSeconds) || 0;
      else if (r.channels && r.channels.sms && r.channels.sms.rawSeconds > 0) secs = Number(r.channels.sms.rawSeconds) || 0;
      else if (r.channels && r.channels.voice && r.channels.voice.rawSeconds > 0) secs = Number(r.channels.voice.rawSeconds) || 0;
      const dur = formatCooldownSmallCaps(secs);
      groups.cooldown.push({ line: '· ' + num + ' ⦂ ' + dur, secs: secs });
    } else if (r.softFallback || r.needsRecheck || r.accountStatus === 'UNKNOWN') {
      const note = r.description ? (' · ' + r.description) : ' · respons tidak stabil';
      groups.other.push('· ' + num + note);
    } else {
      const note = r.description ? (' · ' + r.description) : '';
      groups.other.push('· ' + num + note);
    }
  }

  groups.ready.sort((a, b) => (a.rank || 0) - (b.rank || 0));
  groups.cooldown.sort((a, b) => (a.secs || 0) - (b.secs || 0));
  groups.clone.sort((a, b) => {
    const sa = typeof a === 'object' ? (a.secs ?? 0) : 0;
    const sb = typeof b === 'object' ? (b.secs ?? 0) : 0;
    return sa - sb;
  });

  const lines = [];
  lines.push('✦ <b>ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ sᴇʟᴇsᴀɪ</b>');
  lines.push(buildProgressBar(100) + ' 100%');
  lines.push('ᴘʀᴏɢʀᴇs ⦂ <b>' + total + '</b> / <b>' + total + '</b> ɴᴏᴍᴏʀ');
  lines.push('✧ sɪᴀᴘ ᴅɪᴠᴇʀɪꜰɪᴋᴀsɪ ⦂ <b>' + groups.ready.length + '</b>');
  lines.push('◐ ᴄᴏᴏʟᴅᴏᴡɴ ⦂ <b>' + groups.cooldown.length + '</b>');
  lines.push('△ ᴛɪᴅᴀᴋ sᴜᴘᴘᴏʀᴛ ᴄʟᴏɴᴇ ⦂ <b>' + groups.clone.length + '</b>');
  lines.push('✕ ᴅɪʙᴀᴛᴀsɪ ⦂ <b>' + groups.restricted.length + '</b>');
  if (groups.other.length) lines.push('· ʟᴀɪɴɴʏᴀ ⦂ <b>' + groups.other.length + '</b>');
  lines.push('');
  lines.push('⌖ <b>ʜᴀsɪʟ ᴅᴇᴛᴇᴋsɪ</b>');
  if (groups.ready.length) {
    lines.push('');
    lines.push('✧ <b>sɪᴀᴘ ᴅɪᴠᴇʀɪꜰɪᴋᴀsɪ</b>');
    lines.push('');
    groups.ready.forEach((n) => lines.push(n.line || n));
  }
  if (groups.cooldown.length) {
    lines.push('');
    lines.push('◐ <b>ᴄᴏᴏʟᴅᴏᴡɴ ᴡʜᴀᴛsᴀᴘᴘ</b>');
    lines.push('');
    groups.cooldown.forEach((n) => lines.push(n.line || n));
  }
  if (groups.clone.length) {
    lines.push('');
    lines.push('△ <b>ᴛɪᴅᴀᴋ sᴜᴘᴘᴏʀᴛ ᴄʟᴏɴᴇ</b>');
    lines.push('');
    groups.clone.forEach((n) => lines.push(typeof n === 'object' ? (n.line || n) : n));
  }
  if (groups.restricted.length) {
    lines.push('');
    lines.push('✕ <b>ᴅɪʙᴀᴛᴀsɪ</b>');
    lines.push('');
    groups.restricted.forEach((n) => lines.push(n));
  }
  if (groups.other.length) {
    lines.push('');
    lines.push('· <b>ʟᴀɪɴɴʏᴀ</b>');
    lines.push('');
    groups.other.forEach((n) => lines.push(n));
  }
  try {
    const user = await getEffectiveUser(ctx);
    if (!isOwner(ctx) && !isUserVip(user)) await consumeQuota(ctx.from.id, Math.min(total, 1));
  } catch (e) { console.error('[quota]', e && e.message || e); }
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
}

bot.on('text', async (ctx, next) => {
  const text = (ctx.message && ctx.message.text) || '';
  if (/^(⌖\s*DETECT|✧\s*BELI|◈\s*STATUS|♛|♧|✉)/i.test(text)) return next();
  const mode = await redis.get('detect:mode:' + ctx.from.id);
  if (mode !== 'waiting_numbers') return next();
  const phones = extractPhoneCandidates(text);
  if (!phones.length) {
    return ctx.reply('✦ <b>ɴᴏᴍᴏʀ ᴛɪᴅᴀᴋ ᴅɪᴛᴇᴍᴜᴋᴀɴ</b>\n\n<blockquote>ᴋɪʀɪᴍ ɴᴏᴍᴏʀ ᴅᴇɴɢᴀɴ ғᴏʀᴍᴀᴛ ʏᴀɴɢ ʙᴇɴᴀʀ.\nᴄᴏɴᴛᴏʜ ⦂ +6281234567890</blockquote>', { parse_mode: 'HTML' });
  }
  const user = await getEffectiveUser(ctx);
  const isVip = isOwner(ctx) || isUserVip(user);
  const max = isVip ? 30 : 1;
  const list = phones.slice(0, max);
  if (!isVip && phones.length > 1) {
    return ctx.reply('✦ <b>ʟɪᴍɪᴛ ᴀᴋᴜɴ ɢʀᴀᴛɪs</b>\n\n<blockquote>ᴀᴋᴜɴ ɢʀᴀᴛɪs ʜᴀɴʏᴀ ʙɪsᴀ ᴄᴇᴋ 1 ɴᴏᴍᴏʀ.\nᴜᴘɢʀᴀᴅᴇ ᴘʀᴇᴍɪᴜᴍ ᴜɴᴛᴜᴋ ʙᴜʟᴋ ʜɪɴɢɢᴀ 30 ɴᴏᴍᴏʀ.</blockquote>', {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[styledCallback('✧ BELI PREMIUM', 'store:premium', 'success')]])
    });
  }
  return processDetection(ctx, list);
});

if (require.main === module) {
  process.on('unhandledRejection', (err) => { console.error('[unhandledRejection]', err && err.stack || err); });
  process.on('uncaughtException', (err) => { console.error('[uncaughtException]', err && err.stack || err); });
  bot.launch({ dropPendingUpdates: true })
    .then(() => console.log('[bot] launched successfully'))
    .catch((err) => { console.error('[launch]', err && err.stack || err); process.exitCode = 1; });
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
module.exports = bot;
