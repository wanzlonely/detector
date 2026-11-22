require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const {
  redis, getPackagesByTier, getPackageById, getOrCreateUser, isUserVip,
  getGlobalStats, activateVip, registerReferral, getReferralStats, getLeaderboard, getUserRank, redeemReferralReward,
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
  ['⌖ DETECT'],
  ['✧ BELI PREMIUM', '◈ STATUS'],
  ['♛ LEADERBOARD', '♧ REFERRAL'],
  ['✉︎ HUBUNGI ADMIN']
]).resize().placeholder('Pilih menu…');

const OWNER_KEYBOARD = Markup.keyboard([
  ['⌖ DETECT'],
  ['✧ BELI PREMIUM', '◈ STATUS'],
  ['♛ LEADERBOARD', '♧ REFERRAL'],
  ['✉︎ HUBUNGI ADMIN'],
  ['♛ OWNER CONSOLE'],
  ['✚ AKTIVASI PREMIUM', '▤ BROADCAST']
]).resize().placeholder('Pilih fungsi owner…');

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
    [
      styledCallback('✓ BELI · ' + formatIDR(pkg.price), 'buy:' + pkg.id, 'success'),
      styledCallback('↶ KEMBALI', 'store:premium', 'danger')
    ]
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
  const [rows, myRank] = await Promise.all([
    getLeaderboard(10),
    getUserRank(ctx.from.id)
  ]);
  return ctx.reply(require('./themes').renderLeaderboard(rows, myRank), { parse_mode: 'HTML' });
}
async function showReferral(ctx) {
  const me = await bot.telegram.getMe();
  const link = 'https://t.me/' + me.username + '?start=ref_' + ctx.from.id;
  const stats = await getReferralStats(ctx.from.id);
  const shareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent('Gabung MetaDetect!');
  return ctx.reply(require('./themes').renderReferral({ link, stats }), { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.url('⇧ BAGIKAN TAUTAN', shareUrl), styledCallback('◈ TUKAR KOIN', 'referral:menu', 'primary')]]) });
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

  function pushDigits(digits) {
    if (!digits) return;
    digits = String(digits).replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    // 08xxxxxxxxxx (ID local) -> 62xxxxxxxxxx
    if (digits.startsWith('08') && digits.length >= 10 && digits.length <= 13) {
      digits = '62' + digits.slice(1);
    }
    if (digits.length < 8 || digits.length > 15) return;
    if (/^(19|20)\d{2}$/.test(digits)) return;
    if (seen.has(digits)) return;
    seen.add(digits);
    phones.push('+' + digits);
  }

  // 1) Prioritas: satu nomor per baris / koma / titik-koma (tidak campur antar baris)
  const lines = raw.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    // Ambil deretan digit (+ opsional) di dalam baris
    const m = line.match(/(?:\+|00)?\d[\d\s\-().]{6,18}\d/);
    if (m) pushDigits(m[0]);
    else pushDigits(line);
  }

  // 2) Fallback: scan seluruh teks jika belum ketemu
  if (!phones.length) {
    const pattern = /(?:\+|00)?\d(?:[\d\-().]{6,18})\d/g;
    let match;
    while ((match = pattern.exec(raw)) !== null) {
      pushDigits(match[0]);
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
  await ctx.answerCbQuery('Memperbarui status real-time…').catch(() => {});
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
  // Detect ulang dari server — tidak pakai cache/sticky
  return processDetection(ctx, numbers, { forceRefresh: true });
});

bot.action('detect:info', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const infoText = [
    'ⓘ <b>ᴋᴇᴛᴇʀᴀɴɢᴀɴ ʜᴀsɪʟ ᴅᴇᴛᴇᴋsɪ</b>',
    '──────────────────────',
    '✧ <b>sɪᴀᴘ ᴅɪᴠᴇʀɪꜰɪᴋᴀsɪ</b>',
    'ɴᴏᴍᴏʀ ᴀᴍᴀɴ & sɪᴀᴘ ʟᴏɢɪɴ sᴇᴋᴀʀᴀɴɢ.',
    '',
    '◐ <b>ᴄᴏᴏʟᴅᴏᴡɴ ᴡʜᴀᴛsᴀᴘᴘ</b>',
    'ɴᴏᴍᴏʀ sᴇᴅᴀɴɢ ᴊᴇᴅᴀ ᴠᴇʀɪꜰɪᴋᴀsɪ, ᴛᴜɴɢɢᴜ sᴇsᴜᴀɪ ᴡᴀᴋᴛᴜ ʏᴀɴɢ ᴛᴇʀᴛᴇʀᴀ.',
    '',
    '✕ <b>ᴅɪʙᴀᴛᴀsɪ</b>',
    'ɴᴏᴍᴏʀ ᴛᴇʀᴋᴇɴᴀ ʙᴀᴛᴀsᴀɴ / ʙʟᴏᴋɪʀ sᴇᴍᴇɴᴛᴀʀᴀ.',
    '──────────────────────',
    '◉ ᴏɴ-ᴅᴇᴠɪᴄᴇ ⦂ ᴋᴏᴅᴇ ᴍᴀsᴜᴋ ᴋᴇ ᴡᴀ ᴅɪ ʜᴘ ʟᴀᴍᴀ.',
    '○ ᴏꜰꜰ-ᴅᴇᴠɪᴄᴇ ⦂ ʟᴀɴɢsᴜɴɢ ᴘɪʟɪʜ sᴍs / ᴘᴀɴɢɢɪʟᴀɴ.'
  ].join('\n');
  return ctx.reply(infoText, { parse_mode: 'HTML' });
});

function buildProgressBar(pct) {
  const filled = Math.round(pct / 10);
  return '●'.repeat(filled) + '○'.repeat(10 - filled);
}

function formatCooldownSmallCaps(seconds) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  if (sec <= 0) return '0ᴅ';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts = [];
  if (h > 0) parts.push(h + 'ᴊ');
  if (m > 0) parts.push(m + 'ᴍ');
  if (s > 0 || parts.length === 0) parts.push(s + 'ᴅ');
  return parts.join(' ');
}

function toSmallCapsDevice(name) {
  if (!name) return 'ᴜɴᴋɴᴏᴡɴ';
  const map = {
    a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ',
    k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 's', t: 'ᴛ',
    u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
  };
  return String(name).toLowerCase().replace(/[a-z]/g, (ch) => map[ch] || ch);
}
function deviceLabel(r) {
  // ◉ ON-DEVICE = kode masuk ke WA di HP lama; ○ OFF-DEVICE = langsung SMS/panggilan
  if (r && (r.deviceName || r.waOldEligible)) return '◉ ᴏɴ-ᴅᴇᴠɪᴄᴇ';
  return '○ ᴏꜰꜰ-ᴅᴇᴠɪᴄᴇ';
}

const PROGRESS_SPINNERS = ['◐', '◓', '◑', '◒'];
let progressSpinIdx = 0;

function buildProgressText(processed, total, stageLabel, currentNumber) {
  const safeTotal = total > 0 ? total : 1;
  const safeProcessed = Math.min(Math.max(0, processed), safeTotal);
  const pct = Math.round((safeProcessed / safeTotal) * 100);
  const isDone = safeProcessed >= safeTotal;
  const title = isDone
    ? '✦  ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ sᴇʟᴇsᴀɪ'
    : '◔  ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ ʙᴇʀᴊᴀʟᴀɴ';
  let currentLine;
  if (isDone) {
    currentLine = 'sᴀᴀᴛ ɪɴɪ ⦂ <b>sᴇᴍᴜᴀ ɴᴏᴍᴏʀ sᴇʟᴇsᴀɪ</b>';
  } else {
    const spin = PROGRESS_SPINNERS[progressSpinIdx % PROGRESS_SPINNERS.length];
    progressSpinIdx += 1;
    const num = currentNumber || '-';
    currentLine = 'sᴀᴀᴛ ɪɴɪ ⦂ ' + spin + ' <code>' + num + '</code> ' + spin;
  }
  return (
    title + '\n\n' +
    buildProgressBar(pct) + '  <b>' + pct + '%</b>\n' +
    'ᴘʀᴏɢʀᴇs ⦂ <b>' + safeProcessed + '</b> / <b>' + safeTotal + '</b> ɴᴏᴍᴏʀ\n' +
    currentLine + '\n' +
    '──────────────────────'
  );
}

async function processDetection(ctx, numbers, detectOpts) {
  detectOpts = detectOpts || {};
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
  let currentNumber = '-';
  try {
    progressMsg = await ctx.reply(buildProgressText(0, stageTotal, currentStageLabel, currentNumber), { parse_mode: 'HTML' });
  } catch (_) {}
  async function updateProgress() {
    if (!progressMsg) return;
    try {
      await ctx.telegram.editMessageText(progressMsg.chat.id, progressMsg.message_id, undefined, buildProgressText(stageProcessed, stageTotal, currentStageLabel, currentNumber), { parse_mode: 'HTML' });
    } catch (_) {}
  }
  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
  function preserveNumber(raw, result) {
    const digits = String(raw || '').replace(/\D/g, '');
    const fallback = digits ? ('+' + digits) : String(raw || '');
    if (!result) return fallback;
    const shown = String(result.formattedNumber || '').replace(/\D/g, '');
    // If result lost country code (shorter/different than input), force original
    if (!shown || (digits.length >= 10 && shown.length < digits.length - 1) || (digits.length >= 10 && !digits.endsWith(shown.slice(-8)))) {
      result.formattedNumber = fallback;
    } else if (!String(result.formattedNumber || '').startsWith('+') && digits) {
      result.formattedNumber = '+' + shown;
    }
    return result.formattedNumber || fallback;
  }
  async function checkOne(raw, waveOpts) {
    const stop = await redis.get('detect:stop:' + userId + ':' + jobId);
    if (stop) return { cancelled: true };
    const digits = String(raw || '').replace(/\D/g, '');
    const safeNumber = digits ? ('+' + digits) : String(raw || '');
    const opts = Object.assign({ skipSticky: true, forceRefresh: Boolean(detectOpts.forceRefresh) }, waveOpts || {});
    let last = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const stop2 = await redis.get('detect:stop:' + userId + ':' + jobId);
      if (stop2) return { cancelled: true };
      try {
        let result = await checkWhatsAppCooldown(raw, opts);
        if (result && !result.cancelled) {
          preserveNumber(raw, result);
          // soft / network → retry with short backoff (max 2 attempts for speed)
          const isNetFail = result.softFallback || result.needsRecheck ||
            (result.description && /transport|network|too_many|timeout|ECONN|unstable/i.test(String(result.description)));
          if (isNetFail && attempt < 2) {
            last = result;
            await sleep(250 * attempt + Math.floor(Math.random() * 200));
            continue;
          }
          if (result.softFallback && (result.isReady || result.anyCooldown || result.isBanned)) {
            result.softFallback = false;
            result.needsRecheck = false;
          }
          if (!result.error && !result.softFallback) {
            await addCheckLog(userId, result.formattedNumber || safeNumber, result.accountStatus || result.description || '-', result.proxyTag || result.proxyInfo || '-').catch(() => {});
          }
          return result;
        }
      } catch (err) {
        last = {
          formattedNumber: safeNumber,
          isBanned: false, isCloneBlocked: false, isReady: false, anyCooldown: false,
          accountStatus: 'UNKNOWN', error: false, softFallback: true, confidence: 0.2,
          needsRecheck: true,
          description: String((err && err.message) || 'network').slice(0, 120)
        };
        await sleep(300 * attempt + Math.floor(Math.random() * 250));
      }
    }
    // Final: jangan biarkan "Lainnya" kosong info — kembalikan last atau soft
    if (last) {
      preserveNumber(raw, last);
      return last;
    }
    return {
      formattedNumber: safeNumber, isBanned: false, isCloneBlocked: false, isReady: false,
      anyCooldown: false, accountStatus: 'UNKNOWN', error: false, softFallback: true,
      confidence: 0.2, needsRecheck: true, description: 'Respons tidak stabil · coba ulang'
    };
  }
  async function runPool(indexes, waveOpts) {
    let cursor = 0;
    stageProcessed = 0;
    stageTotal = indexes.length || 1;
    let conc;
    // Target: ~30 nomor < 30 detik → concurrency lebih tinggi, tetap aman
    if (indexes.length >= 20) conc = 10;
    else if (indexes.length >= 12) conc = 8;
    else if (indexes.length >= 6) conc = 8;
    else conc = Math.min(10, indexes.length || 1);
    const CONCURRENCY_SAFE = Math.max(1, conc);
    async function worker(workerId) {
      if (workerId > 0) await sleep(workerId * 40);
      while (cursor < indexes.length) {
        const stop = await redis.get('detect:stop:' + userId + ':' + jobId);
        if (stop) return;
        const pos = cursor++;
        if (pos >= indexes.length) return;
        const i = indexes[pos];
        const rawNum = numbers[i];
        const digs = String(rawNum || '').replace(/\D/g, '');
        currentNumber = digs ? ('+' + digs) : String(rawNum || '-');
        await updateProgress();
        results[i] = await checkOne(numbers[i], waveOpts);
        stageProcessed += 1;
        await updateProgress();
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY_SAFE }, (_, id) => worker(id)));
    stageProcessed = stageTotal;
    await updateProgress();
  }
  const allIdx = Array.from({ length: total }, (_, i) => i);
  // Selalu dual-probe (exist+code) agar akurat — SMS wait & device dari response lengkap
  currentStageLabel = total > 1 ? 'ᴍᴇᴍᴘʀᴏsᴇs ' + total + ' ɴᴏᴍᴏʀ' : 'ᴍᴇᴍᴘʀᴏsᴇs ᴛᴀʀɢᴇᴛ';
  await runPool(allIdx, { wave: 'full' });
  const stopped = await redis.get('detect:stop:' + userId + ':' + jobId);
  await redis.del('detect:active:' + userId);
  await redis.del('detect:stop:' + userId + ':' + jobId);
  if (stopped) return ctx.reply('✕ <b>ᴅᴇᴛᴇᴋsɪ ᴅɪʙᴀᴛᴀʟᴋᴀɴ</b>', { parse_mode: 'HTML' });

  const groups = { ready: [], cooldown: [], restricted: [], other: [] };
  for (let gi = 0; gi < results.length; gi++) {
    const r = results[gi];
    if (!r || r.cancelled) continue;
    // Always prefer original input number for display
    const origDigits = String(numbers[gi] || '').replace(/\D/g, '');
    const origNum = origDigits ? ('+' + origDigits) : null;
    let num = origNum || r.formattedNumber || '-';
    const shownDigits = String(num).replace(/\D/g, '');
    if (origDigits && shownDigits && shownDigits !== origDigits) {
      num = origNum;
    }
    r.formattedNumber = num;
    if (r.isBanned === true || r.accountStatus === 'BANNED') {
      groups.restricted.push(num);
    } else if (r.anyCooldown || r.accountStatus === 'IN_COOLDOWN') {
      let secs = 0;
      if (r.primaryTimer && r.primaryTimer.rawSeconds > 0) secs = Number(r.primaryTimer.rawSeconds) || 0;
      else if (r.secondarySeconds > 0) secs = Number(r.secondarySeconds) || 0;
      else if (r.channels && r.channels.sms && r.channels.sms.rawSeconds > 0) secs = Number(r.channels.sms.rawSeconds) || 0;
      else if (r.channels && r.channels.voice && r.channels.voice.rawSeconds > 0) secs = Number(r.channels.voice.rawSeconds) || 0;
      const dur = formatCooldownSmallCaps(secs);
      const dev = deviceLabel(r);
      groups.cooldown.push({ line: num + ' ⦂ ' + dur + ' ' + dev, secs: secs, rank: (r.deviceName || r.waOldEligible) ? 0 : 1 });
    } else if (r.isReady) {
      const dev = deviceLabel(r);
      groups.ready.push({ line: num + ' ' + dev, rank: (r.deviceName || r.waOldEligible) ? 0 : 1 });
    } else if (r.softFallback || r.needsRecheck || r.accountStatus === 'UNKNOWN') {
      const note = r.description ? (' · ' + r.description) : ' · respons tidak stabil';
      groups.other.push(num + note);
    } else {
      const note = r.description ? (' · ' + r.description) : '';
      groups.other.push(num + note);
    }
  }

  // ON-DEVICE selalu di atas
  groups.ready.sort((a, b) => (a.rank || 0) - (b.rank || 0));
  groups.cooldown.sort((a, b) => {
    const ra = a.rank != null ? a.rank : 1;
    const rb = b.rank != null ? b.rank : 1;
    if (ra !== rb) return ra - rb;
    return (a.secs || 0) - (b.secs || 0);
  });

  const lines = [];
  lines.push('✦  ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ sᴇʟᴇsᴀɪ');
  lines.push('');
  lines.push(buildProgressBar(100) + '  100%');
  lines.push('ᴘʀᴏɢʀᴇs ⦂ <b>' + total + '</b> / <b>' + total + '</b> ɴᴏᴍᴏʀ');
  lines.push('sᴀᴀᴛ ɪɴɪ ⦂ sᴇᴍᴜᴀ ɴᴏᴍᴏʀ sᴇʟᴇsᴀɪ');
  lines.push('──────────────────────');
  lines.push('✧ sɪᴀᴘ ᴅɪᴠᴇʀɪꜰɪᴋᴀsɪ ⦂ <b>' + groups.ready.length + '</b>');
  lines.push('◐ ᴄᴏᴏʟᴅᴏᴡɴ ⦂ <b>' + groups.cooldown.length + '</b>');
  lines.push('✕ ᴅɪʙᴀᴛᴀsɪ ⦂ <b>' + groups.restricted.length + '</b>');
  if (groups.other.length) lines.push('· ʟᴀɪɴɴʏᴀ ⦂ <b>' + groups.other.length + '</b>');
  lines.push('──────────────────────');
  lines.push('⌖ <b>ʜᴀsɪʟ ᴅᴇᴛᴇᴋsɪ</b>');
  if (groups.ready.length) {
    lines.push('');
    lines.push('✧ <b>sɪᴀᴘ ᴅɪᴠᴇʀɪꜰɪᴋᴀsɪ</b>');
    groups.ready.forEach((n) => lines.push(n.line || n));
  }
  if (groups.cooldown.length) {
    lines.push('');
    lines.push('◐ <b>ᴄᴏᴏʟᴅᴏᴡɴ ᴡʜᴀᴛsᴀᴘᴘ</b>');
    groups.cooldown.forEach((n) => lines.push(n.line || n));
  }
  if (groups.restricted.length) {
    lines.push('');
    lines.push('✕ <b>ᴅɪʙᴀᴛᴀsɪ</b>');
    groups.restricted.forEach((n) => lines.push(n));
  }
  if (groups.other.length) {
    lines.push('');
    lines.push('· <b>ʟᴀɪɴɴʏᴀ</b>');
    groups.other.forEach((n) => lines.push(n));
  }
  try {
    const user = await getEffectiveUser(ctx);
    const checkedCount = results.filter((r) => r && !r.cancelled).length || total;
    if (!isOwner(ctx) && !isUserVip(user)) {
      await consumeQuota(ctx.from.id, Math.min(checkedCount, 1));
    } else {
      await incrementUserChecks(ctx.from.id, checkedCount);
    }
  } catch (e) { console.error('[quota/leaderboard]', e && e.message || e); }
  const refreshKey = 'detect:refresh:' + userId + ':' + jobId;
  try {
    await redis.set(refreshKey, JSON.stringify(numbers), { ex: 3600 });
  } catch (_) {}
  return ctx.reply(lines.join('\n'), {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [
        styledCallback('↻ UPDATE STATUS', 'detect:refresh:' + jobId, 'success'),
        styledCallback('ⓘ KETERANGAN', 'detect:info', 'primary')
      ]
    ])
  });
}

bot.hears('♛ OWNER CONSOLE', async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply('✕ ᴀᴋsᴇs ᴅɪᴛᴏʟᴀᴋ', { parse_mode: 'HTML' });
  return ctx.reply('♛ <b>ᴏᴡɴᴇʀ ᴄᴏɴsᴏʟᴇ</b>\n\nᴘɪʟɪʜ ᴀᴋsɪ ᴅɪ ʙᴀᴡᴀʜ.', {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [
        styledCallback('✚ AKTIVASI PREMIUM', 'owner:activate', 'success'),
        styledCallback('▤ BROADCAST', 'owner:broadcast', 'primary')
      ]
    ])
  });
});
bot.hears('✚ AKTIVASI PREMIUM', async (ctx) => {
  if (!isOwner(ctx)) return;
  await setOwnerAction(ctx.from.id, 'activate_vip');
  return ctx.reply('✚ <b>ᴀᴋᴛɪᴠᴀsɪ ᴘʀᴇᴍɪᴜᴍ</b>\n\nᴋɪʀɪᴍ ғᴏʀᴍᴀᴛ:\n<code>user_id hari</code>\nᴄᴏɴᴛᴏʜ: <code>123456789 30</code>', { parse_mode: 'HTML' });
});
bot.hears('▤ BROADCAST', async (ctx) => {
  if (!isOwner(ctx)) return;
  await setOwnerAction(ctx.from.id, 'broadcast');
  return ctx.reply('▤ <b>ʙʀᴏᴀᴅᴄᴀsᴛ</b>\n\nᴋɪʀɪᴍ ᴘᴇsᴀɴ ʏᴀɴɢ ɪɴɢɪɴ ᴅɪsᴇʙᴀʀ ᴋᴇ sᴇᴍᴜᴀ ᴜsᴇʀ.', { parse_mode: 'HTML' });
});
bot.action('owner:activate', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!isOwner(ctx)) return;
  await setOwnerAction(ctx.from.id, 'activate_vip');
  return ctx.reply('✚ <b>ᴀᴋᴛɪᴠᴀsɪ ᴘʀᴇᴍɪᴜᴍ</b>\n\nᴋɪʀɪᴍ ғᴏʀᴍᴀᴛ:\n<code>user_id hari</code>\nᴄᴏɴᴛᴏʜ: <code>123456789 30</code>', { parse_mode: 'HTML' });
});
bot.action('owner:broadcast', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!isOwner(ctx)) return;
  await setOwnerAction(ctx.from.id, 'broadcast');
  return ctx.reply('▤ <b>ʙʀᴏᴀᴅᴄᴀsᴛ</b>\n\nᴋɪʀɪᴍ ᴘᴇsᴀɴ ʏᴀɴɢ ɪɴɢɪɴ ᴅɪsᴇʙᴀʀ ᴋᴇ sᴇᴍᴜᴀ ᴜsᴇʀ.', { parse_mode: 'HTML' });
});
bot.action(/^contact:reply:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!isOwner(ctx)) return;
  const targetId = ctx.match[1];
  await redis.set('owner:contact:target:' + ctx.from.id, targetId, { ex: 600 });
  return ctx.reply('✉︎ <b>ʙᴀʟᴀs ᴘᴇsᴀɴ</b>\n\nᴋɪʀɪᴍ ʙᴀʟᴀsᴀɴ ᴜɴᴛᴜᴋ ᴜsᴇʀ <code>' + targetId + '</code>.', { parse_mode: 'HTML' });
});
const REFERRAL_OFFERS = {
  'quota_3': { type: 'quota', amount: 3, cost: 10, label: '3 ᴋᴜᴏᴛᴀ ᴄᴇᴋ' },
  'vip_1': { type: 'vip', amount: 1, cost: 25, label: '1 ʜᴀʀɪ ᴘʀᴇᴍɪᴜᴍ' },
  'vip_3': { type: 'vip', amount: 3, cost: 50, label: '3 ʜᴀʀɪ ᴘʀᴇᴍɪᴜᴍ' },
  'vip_7': { type: 'vip', amount: 7, cost: 100, label: '7 ʜᴀʀɪ ᴘʀᴇᴍɪᴜᴍ' }
};

async function showReferralExchange(ctx, edit) {
  const stats = await getReferralStats(ctx.from.id);
  const message = require('./themes').renderReferralExchange(stats);
  const keyboard = Markup.inlineKeyboard([
    [styledCallback('✧ 3 ᴋᴜᴏᴛᴀ · 10 ᴋᴏɪɴ', 'referral:redeem:quota_3', 'primary')],
    [styledCallback('✧ 1 ʜᴀʀɪ · 25 ᴋᴏɪɴ', 'referral:redeem:vip_1', 'success')],
    [styledCallback('✧ 3 ʜᴀʀɪ · 50 ᴋᴏɪɴ', 'referral:redeem:vip_3', 'success')],
    [styledCallback('✧ 7 ʜᴀʀɪ · 100 ᴋᴏɪɴ', 'referral:redeem:vip_7', 'success')],
    [styledCallback('↶ KEMBALI', 'referral:back', 'danger')]
  ]);
  if (edit && ctx.editMessageText) {
    return ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard }).catch(() =>
      ctx.reply(message, { parse_mode: 'HTML', ...keyboard })
    );
  }
  return ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
}

bot.action('referral:menu', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  return showReferralExchange(ctx, false);
});

bot.action('referral:back', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const me = await bot.telegram.getMe();
  const link = 'https://t.me/' + me.username + '?start=ref_' + ctx.from.id;
  const stats = await getReferralStats(ctx.from.id);
  const shareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent('Gabung MetaDetect!');
  return ctx.editMessageText(require('./themes').renderReferral({ link, stats }), {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([[Markup.button.url('⇧ BAGIKAN TAUTAN', shareUrl), styledCallback('◈ TUKAR KOIN', 'referral:menu', 'primary')]])
  }).catch(async () => {
    return ctx.reply(require('./themes').renderReferral({ link, stats }), {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.url('⇧ BAGIKAN TAUTAN', shareUrl), styledCallback('◈ TUKAR KOIN', 'referral:menu', 'primary')]])
    });
  });
});

bot.action(/^referral:redeem:(quota_3|vip_1|vip_3|vip_7)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const offerKey = ctx.match[1];
  const offer = REFERRAL_OFFERS[offerKey];
  if (!offer) return ctx.reply('✕ ᴘᴀᴋᴇᴛ ᴛɪᴅᴀᴋ ᴅɪᴛᴇᴍᴜᴋᴀɴ', { parse_mode: 'HTML' });
  try {
    const result = await redeemReferralReward(ctx.from.id, offer);
    if (!result.ok) {
      return ctx.reply(
        '✕ <b>ᴋᴏɪɴ ᴛɪᴅᴀᴋ ᴄᴜᴋᴜᴘ</b>\n\n' +
        '▸ sᴀʟᴅᴏ ⦂ <b>' + result.balance + '</b> ᴋᴏɪɴ\n' +
        '▸ ᴅɪʙᴜᴛᴜʜᴋᴀɴ ⦂ <b>' + offer.cost + '</b> ᴋᴏɪɴ\n\n' +
        '<blockquote>ᴜɴᴅᴀɴɢ ᴛᴇᴍᴀɴ ʟᴇʙɪʜ ʙᴀɴʏᴀᴋ ᴜɴᴛᴜᴋ ᴍᴇɴᴅᴀᴘᴀᴛᴋᴀɴ ᴋᴏɪɴ.</blockquote>',
        { parse_mode: 'HTML' }
      );
    }
    const successMsg = offer.type === 'quota'
      ? ('✓ <b>ᴘᴇɴᴜᴋᴀʀᴀɴ ʙᴇʀʜᴀsɪʟ</b>\n\n' +
         '▸ ᴘᴀᴋᴇᴛ ⦂ <b>' + offer.label + '</b>\n' +
         '▸ sɪsᴀ ᴋᴏɪɴ ⦂ <b>' + result.balance + '</b>\n\n' +
         '<blockquote>ᴋᴜᴏᴛᴀ ᴛᴀᴍʙᴀʜᴀɴ sᴜᴅᴀʜ ᴀᴋᴛɪғ ᴅᴀɴ ʙɪsᴀ ʟᴀɴɢsᴜɴɢ ᴅɪᴘᴀᴋᴀɪ.</blockquote>')
      : ('✓ <b>ᴘᴇɴᴜᴋᴀʀᴀɴ ʙᴇʀʜᴀsɪʟ</b>\n\n' +
         '▸ ᴘᴀᴋᴇᴛ ⦂ <b>' + offer.label + '</b>\n' +
         '▸ sɪsᴀ ᴋᴏɪɴ ⦂ <b>' + result.balance + '</b>\n\n' +
         '<blockquote>ᴀᴋsᴇs ᴘʀᴇᴍɪᴜᴍ sᴜᴅᴀʜ ᴀᴋᴛɪғ. sᴇʟᴀᴍᴀᴛ ᴍᴇɴᴄᴏʙᴀ!</blockquote>');
    return ctx.reply(successMsg, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('[referral redeem]', err && err.message || err);
    return ctx.reply('✕ ɢᴀɢᴀʟ ᴍᴇɴᴜᴋᴀʀ. ᴄᴏʙᴀ ʟᴀɢɪ.', { parse_mode: 'HTML' });
  }
});

bot.on('text', async (ctx, next) => {
  const text = (ctx.message && ctx.message.text) || '';
  if (/^(⌖\s*DETECT|✧\s*BELI|◈\s*STATUS|♛|♧|✉)/i.test(text)) return next();

  // Owner reply to user contact
  if (isOwner(ctx)) {
    const replyTarget = await redis.get('owner:contact:target:' + ctx.from.id);
    if (replyTarget) {
      await redis.del('owner:contact:target:' + ctx.from.id);
      try {
        await ctx.telegram.sendMessage(Number(replyTarget), '✉︎ <b>ʙᴀʟᴀsᴀɴ ᴀᴅᴍɪɴ</b>\n\n' + escapeHtml(text), { parse_mode: 'HTML' });
        return ctx.reply('✓ ᴘᴇsᴀɴ ᴛᴇʀᴋɪʀɪᴍ ᴋᴇ ᴜsᴇʀ <code>' + replyTarget + '</code>.', { parse_mode: 'HTML' });
      } catch (err) {
        return ctx.reply('✕ ɢᴀɢᴀʟ ᴍᴇɴɢɪʀɪᴍ: ' + String(err.message || err).slice(0, 120));
      }
    }
    const ownerAction = await getOwnerAction(ctx.from.id);
    if (ownerAction === 'activate_vip') {
      await clearOwnerAction(ctx.from.id);
      const parts = text.trim().split(/\s+/);
      const targetId = Number(parts[0]);
      const days = Number(parts[1] || 30);
      if (!targetId || !days) {
        return ctx.reply('✕ ғᴏʀᴍᴀᴛ sᴀʟᴀʜ. ᴄᴏɴᴛᴏʜ: <code>123456789 30</code>', { parse_mode: 'HTML' });
      }
      try {
        await activateVip(targetId, days, 'OWNER');
        try { await ctx.telegram.sendMessage(targetId, '✧ <b>ᴘʀᴇᴍɪᴜᴍ ᴀᴋᴛɪғ</b>\n\nᴀᴋsᴇs ᴘʀᴇᴍɪᴜᴍ ᴋᴀᴍᴜ ᴛᴇʟᴀʜ ᴅɪᴀᴋᴛɪғᴋᴀɴ sᴇʟᴀᴍᴀ <b>' + days + '</b> ʜᴀʀɪ.', { parse_mode: 'HTML' }); } catch (_) {}
        return ctx.reply('✓ ᴘʀᴇᴍɪᴜᴍ ᴀᴋᴛɪғ ᴜɴᴛᴜᴋ <code>' + targetId + '</code> · ' + days + ' ʜᴀʀɪ.', { parse_mode: 'HTML' });
      } catch (err) {
        return ctx.reply('✕ ɢᴀɢᴀʟ: ' + String(err.message || err).slice(0, 120));
      }
    }
    if (ownerAction === 'broadcast') {
      await clearOwnerAction(ctx.from.id);
      return ctx.reply('▤ ʙʀᴏᴀᴅᴄᴀsᴛ ᴅɪᴛᴇʀɪᴍᴀ. (ғɪᴛᴜʀ sᴇᴘᴇɴᴜʜɴʏᴀ ᴍᴇᴍᴇʀʟᴜᴋᴀɴ ᴅᴀғᴛᴀʀ ᴜsᴇʀ ɪᴅ ᴅɪ ʀᴇᴅɪs)', { parse_mode: 'HTML' });
    }
  }

  // User contact admin — forward message to owner
  const contactState = await redis.get('contact:state:' + ctx.from.id);
  if (contactState === 'waiting') {
    await redis.del('contact:state:' + ctx.from.id);
    const uname = ctx.from.username ? '@' + ctx.from.username : '-';
    const fullName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || 'Pengguna';
    if (!ADMIN_ID) {
      return ctx.reply('✕ <b>ᴀᴅᴍɪɴ ʙᴇʟᴜᴍ ᴅɪᴋᴏɴғɪɢᴜʀᴀsɪ</b>\n\n<blockquote>sᴇᴛ ᴇɴᴠ ADMIN_ID ᴅɪ ᴠᴇʀᴄᴇʟ.</blockquote>', { parse_mode: 'HTML' });
    }
    try {
      await ctx.telegram.sendMessage(
        ADMIN_ID,
        '✉︎ <b>ᴘᴇsᴀɴ ᴅᴀʀɪ ᴜsᴇʀ</b>\n\n' +
        '▸ ɴᴀᴍᴀ ⦂ <b>' + escapeHtml(fullName) + '</b>\n' +
        '▸ ᴜsᴇʀ ⦂ <b>' + escapeHtml(uname) + '</b>\n' +
        '▸ ɪᴅ ⦂ <code>' + ctx.from.id + '</code>\n\n' +
        '<blockquote>' + escapeHtml(text) + '</blockquote>',
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [styledCallback('↩ BALAS', 'contact:reply:' + ctx.from.id, 'primary')]
          ])
        }
      );
      return ctx.reply('✓ <b>ᴘᴇsᴀɴ ᴛᴇʀᴋɪʀɪᴍ</b>\n\nᴀᴅᴍɪɴ ᴀᴋᴀɴ ᴍᴇᴍʙᴀʟᴀs sᴇʙᴇɢᴀɪᴍᴀɴᴀ ᴍᴜɴɢᴋɪɴ.', { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[contact forward]', err && err.message || err);
      return ctx.reply('✕ <b>ɢᴀɢᴀʟ ᴍᴇɴɢɪʀɪᴍ ᴘᴇsᴀɴ</b>\n\n<blockquote>' + escapeHtml(String(err.message || err).slice(0, 120)) + '</blockquote>', { parse_mode: 'HTML' });
    }
  }

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
    return ctx.reply(
      '✦ <b>ʟɪᴍɪᴛ ᴀᴋᴜɴ ɢʀᴀᴛɪs</b>\n\n' +
      '<blockquote>ᴀᴋᴜɴ ɢʀᴀᴛɪs ʜᴀɴʏᴀ ʙɪsᴀ ᴄᴇᴋ <b>1 ɴᴏᴍᴏʀ</b> ᴘᴇʀ ᴋɪʀɪᴍᴀɴ.\n' +
      'ᴋᴀᴍᴜ ᴋɪʀɪᴍ <b>' + phones.length + '</b> ɴᴏᴍᴏʀ — ʜᴀɴʏᴀ ʏᴀɴɢ ᴘᴇʀᴛᴀᴍᴀ ʏᴀɴɢ ᴅɪᴘʀᴏsᴇs.\n' +
      'ᴜᴘɢʀᴀᴅᴇ ᴘʀᴇᴍɪᴜᴍ ᴜɴᴛᴜᴋ ʙᴜʟᴋ ʜɪɴɢɢᴀ 30 ɴᴏᴍᴏʀ.</blockquote>',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[styledCallback('✧ BELI PREMIUM', 'store:premium', 'success')]])
      }
    );
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
