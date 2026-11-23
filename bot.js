require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const {
  redis, getPackagesByTier, getPackageById, getOrCreateUser, isUserVip,
  getGlobalStats, activateVip, registerReferral, getReferralStats, getLeaderboard, getUserRank, redeemReferralReward
} = require('./database');
const {
  escapeHtml, formatIDR, renderDashboard, renderStoreCatalog,
  renderPackageDetailCard, renderPaymentMaintenanceCard
} = require('./themes');

const { parseDetectionInput } = require('./detectInput');

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
  const navigationText = /^(⌖\s*DETECT|✉\s*VERIFIKASI\s*EMAIL|✧\s*BELI\s*PREMIUM|◈\s*STATUS|♛\s*LEADERBOARD|♧\s*REFERRAL|✉︎?\s*HUBUNGI\s*ADMIN|♛\s*OWNER\s*CONSOLE|✚\s*AKTIVASI\s*PREMIUM|▤\s*BROADCAST|\/start(?:@\w+)?(?:\s.*)?|\/store(?:@\w+)?|\/detect(?:@\w+)?|\/admin(?:@\w+)?)$/i.test(messageText);
  const navigationCallback = /^(store:|pkg:|buy:|referral:|contact:(?!reply:))/.test(callbackData);
  if (navigationText || navigationCallback) {
    try {
      await stopActiveDetection(ctx);
      if (ctx.from) {
        await Promise.all([
          redis.del('detect:mode:' + ctx.from.id),
          redis.del('contact:state:' + ctx.from.id),
          redis.del('email:mode:' + ctx.from.id),
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
  ['⌖ DETECT', '✉ VERIFIKASI EMAIL'],
  ['✧ BELI PREMIUM', '◈ STATUS'],
  ['♛ LEADERBOARD', '♧ REFERRAL'],
  ['✉︎ HUBUNGI ADMIN']
]).resize().placeholder('Pilih menu…');

const OWNER_KEYBOARD = Markup.keyboard([
  ['⌖ DETECT', '✉ VERIFIKASI EMAIL'],
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
      redis.del('email:mode:' + uid),
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
          await ctx.reply('♧ Tautan referral berhasil dicatat. Pengumpulan koin referral baru sedang ditangguhkan; saldo koin lama tetap dapat ditukar.');
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

async function startDetect(ctx) {
  const user = await getEffectiveUser(ctx);
  const premium = isOwner(ctx) || isUserVip(user);
  const configuredLimit = Number(user.bulk_limit) || 30;
  const limit = premium ? Math.max(1, Math.min(30, configuredLimit)) : 1;
  await redis.set('detect:mode:' + ctx.from.id, String(limit), { ex: 300 });
  return ctx.reply(
    '⌖ <b>ᴠᴀʟɪᴅᴀsɪ ɴᴏᴍᴏʀ</b>\n\n' +
    'Kirim nomor milikmu yang ingin divalidasi, satu nomor per baris atau dipisahkan koma.\n' +
    'Batas input: <b>' + limit + ' nomor</b> · ' + (premium ? 'Premium' : 'Free') + '\n\n' +
    'Contoh: <code>+6281234567890</code>\n\n' +
    '<blockquote>Untuk saat ini bot hanya memvalidasi format, normalisasi, dan duplikasi. Bot tidak memeriksa status akun WhatsApp, tidak mengirim OTP, dan tidak memotong kuota.</blockquote>\n' +
    'Ketik /cancel untuk membatalkan.',
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[styledCallback('BATAL', 'detect:cancel_prompt', 'danger')]]) }
  );
}
bot.hears('⌖ DETECT', startDetect);
bot.command('detect', startDetect);
bot.action('detect:cancel_prompt', async (ctx) => {
  await ctx.answerCbQuery('Dibatalkan').catch(() => {});
  await redis.del('detect:mode:' + ctx.from.id);
  return ctx.reply('✕ <b>ᴠᴀʟɪᴅᴀsɪ ᴅɪʙᴀᴛᴀʟᴋᴀɴ</b>', { parse_mode: 'HTML' });
});

async function startEmailVerify(ctx) {
  return ctx.reply(
    '✉ <b>ᴠᴇʀɪғɪᴋᴀsɪ ᴇᴍᴀɪʟ ᴛɪᴅᴀᴋ ᴛᴇʀsᴇᴅɪᴀ</b>\n\n' +
    '<blockquote>Bot tidak dapat memicu atau mengirim kode verifikasi ke nomor. Gunakan proses pemulihan resmi di aplikasi WhatsApp.</blockquote>',
    { parse_mode: 'HTML' }
  );
}
bot.hears('✉ VERIFIKASI EMAIL', startEmailVerify);
bot.command('email', startEmailVerify);

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
  if (/^(⌖\s*DETECT|✉\s*VERIFIKASI|✧\s*BELI|◈\s*STATUS|♛|♧|✉)/i.test(text)) return next();

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
      if (!Number.isSafeInteger(targetId) || targetId <= 0 || !Number.isSafeInteger(days) || days < 1 || days > 3650 || parts.length > 2) {
        return ctx.reply('✕ ғᴏʀᴍᴀᴛ sᴀʟᴀʜ. Gunakan <code>user_id hari</code> dengan durasi 1–3650 hari.', { parse_mode: 'HTML' });
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
      const broadcastText = text.trim();
      if (!broadcastText) {
        return ctx.reply('✕ ᴘᴇsᴀɴ ʙʀᴏᴀᴅᴄᴀsᴛ ᴋᴏsᴏɴɢ.', { parse_mode: 'HTML' });
      }
      let userIds = [];
      try {
        userIds = await redis.smembers('users:all') || [];
      } catch (err) {
        console.error('[broadcast list]', err && err.message || err);
        return ctx.reply('✕ ɢᴀɢᴀʟ ᴍᴇᴍʙᴀᴄᴀ ᴅᴀғᴛᴀʀ ᴜsᴇʀ.', { parse_mode: 'HTML' });
      }
      if (!userIds.length) {
        return ctx.reply('✕ ʙᴇʟᴜᴍ ᴀᴅᴀ ᴜsᴇʀ ᴛᴇʀᴅᴀғᴛᴀʀ ᴅɪ sɪsᴛᴇᴍ.', { parse_mode: 'HTML' });
      }
      const statusMsg = await ctx.reply(
        '▤ <b>ʙʀᴏᴀᴅᴄᴀsᴛ ᴅɪᴍᴜʟᴀɪ</b>\n\n' +
        '▸ ᴛᴏᴛᴀʟ ᴛᴀʀɢᴇᴛ ⦂ <b>' + userIds.length + '</b> ᴜsᴇʀ\n' +
        '▸ sᴛᴀᴛᴜs ⦂ ᴍᴇɴɢɪʀɪᴍ…',
        { parse_mode: 'HTML' }
      );
      let ok = 0;
      let fail = 0;
      const payload =
        '▤ <b>ᴘᴇɴɢᴜᴍᴜᴍᴀɴ</b>\n\n' +
        escapeHtml(broadcastText) + '\n\n' +
        '<i>— MetaDetect</i>';
      for (let bi = 0; bi < userIds.length; bi++) {
        const uid = Number(userIds[bi]);
        if (!uid) { fail += 1; continue; }
        try {
          await ctx.telegram.sendMessage(uid, payload, { parse_mode: 'HTML' });
          ok += 1;
        } catch (_) {
          fail += 1;
        }
        if (bi % 20 === 19) await new Promise((r) => setTimeout(r, 1200));
        else await new Promise((r) => setTimeout(r, 50));
      }
      const doneText =
        '▤ <b>ʙʀᴏᴀᴅᴄᴀsᴛ sᴇʟᴇsᴀɪ</b>\n\n' +
        '▸ ʙᴇʀʜᴀsɪʟ ⦂ <b>' + ok + '</b>\n' +
        '▸ ɢᴀɢᴀʟ ⦂ <b>' + fail + '</b>\n' +
        '▸ ᴛᴏᴛᴀʟ ⦂ <b>' + userIds.length + '</b>';
      try {
        if (statusMsg) {
          await ctx.telegram.editMessageText(statusMsg.chat.id, statusMsg.message_id, undefined, doneText, { parse_mode: 'HTML' });
        } else {
          await ctx.reply(doneText, { parse_mode: 'HTML' });
        }
      } catch (_) {
        await ctx.reply(doneText, { parse_mode: 'HTML' });
      }
      return;
    }
  }

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
      return ctx.reply('✓ <b>ᴘᴇsᴀɴ ᴛᴇʀᴋɪʀɪᴍ</b>\n\nᴀᴅᴍɪɴ ᴀᴋᴀɴ ᴍᴇᴍʙᴀʟᴀs sᴇʙᴀɢᴀɪᴍᴀɴᴀ ᴍᴜɴɢᴋɪɴ.', { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[contact forward]', err && err.message || err);
      return ctx.reply('✕ <b>ɢᴀɢᴀʟ ᴍᴇɴɢɪʀɪᴍ ᴘᴇsᴀɴ</b>\n\n<blockquote>' + escapeHtml(String(err.message || err).slice(0, 120)) + '</blockquote>', { parse_mode: 'HTML' });
    }
  }

  const emailMode = await redis.get('email:mode:' + ctx.from.id);
  if (emailMode) {
    await redis.del('email:mode:' + ctx.from.id);
    return ctx.reply(
      '✉ <b>ᴠᴇʀɪғɪᴋᴀsɪ ᴇᴍᴀɪʟ ᴅɪɴᴏɴᴀᴋᴛɪғᴋᴀɴ</b>\n\n' +
      '<blockquote>Bot tidak mengirim kode verifikasi. Lanjutkan hanya melalui aplikasi WhatsApp resmi.</blockquote>',
      { parse_mode: 'HTML' }
    );
  }

  const detectLimit = await redis.get('detect:mode:' + ctx.from.id);
  if (!detectLimit) return next();
  if (text === '/cancel' || text.toUpperCase() === 'BATAL') {
    await redis.del('detect:mode:' + ctx.from.id);
    return ctx.reply('✕ <b>ᴠᴀʟɪᴅᴀsɪ ᴅɪʙᴀᴛᴀʟᴋᴀɴ</b>', { parse_mode: 'HTML' });
  }

  const parsed = parseDetectionInput(text, Number(detectLimit));
  if (!parsed.ok) {
    return ctx.reply(
      '⚠️ <b>ɪɴᴘᴜᴛ ʙᴇʟᴜᴍ ᴠᴀʟɪᴅ</b>\n\n' +
      escapeHtml(parsed.error) + '\n\nKirim ulang input atau /cancel.',
      { parse_mode: 'HTML' }
    );
  }

  await redis.del('detect:mode:' + ctx.from.id);
  const lines = [
    '⌖ <b>ʜᴀsɪʟ ᴠᴀʟɪᴅᴀsɪ ɪɴᴘᴜᴛ</b>',
    '',
    '✓ Nomor valid: <b>' + parsed.valid.length + '</b>',
    '↺ Duplikat dihapus: <b>' + parsed.duplicates.length + '</b>',
    '✕ Format tidak valid: <b>' + parsed.invalid.length + '</b>',
    '',
    ...parsed.valid.map((number, index) => (index + 1) + '. <code>' + escapeHtml(number) + '</code>'),
    '',
    '⚠️ <b>Status WhatsApp/cooldown tidak diperiksa.</b>',
    'Tidak ada OTP yang dikirim dan kuota tidak dipotong.'
  ];
  if (parsed.invalid.length) lines.push('', '<b>Format tidak valid:</b>', ...parsed.invalid.map((value) => '• <code>' + escapeHtml(value) + '</code>'));
  if (parsed.duplicates.length) lines.push('', '<b>Duplikat:</b>', ...parsed.duplicates.map((value) => '• <code>' + escapeHtml(value) + '</code>'));
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
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