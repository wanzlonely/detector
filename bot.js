require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const {
  redis, getPackagesByTier, getPackageById, getOrCreateUser, isUserVip,
  getGlobalStats, activateVip, registerReferral, getReferralStats, getLeaderboard, redeemReferralReward,
  consumeQuota, addCheckLog, getCachedCheckResult, setCachedCheckResult, qualifyReferral,
  incrementUserChecks
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

bot.action(/^detect:refresh:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('Memperbarui status…').catch(() => {});
  const userId = ctx.from && ctx.from.id;
  const jobId = ctx.match[1];
  if (!userId || !jobId) return;
  const key = 'detect:refresh:' + userId + ':' + jobId;
  let numbers = null;
  try {
    const raw = await redis.get(key);
    if (raw) numbers = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (_) {}
  if (!Array.isArray(numbers) || !numbers.length) {
    return ctx.reply('✦ <b>ᴅᴀᴛᴀ ʀᴇғʀᴇsʜ ᴛɪᴅᴀᴋ ᴅɪᴛᴇᴍᴜᴋᴀɴ</b>\n\n<blockquote>sɪʟᴀᴋᴀɴ ᴊᴀʟᴀɴᴋᴀɴ ᴅᴇᴛᴇᴋsɪ ʙᴀʀᴜ.</blockquote>', { parse_mode: 'HTML' });
  }
  return processDetection(ctx, numbers);
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

// processDetection and rest of file continue in next commit if needed
module.exports = bot;
