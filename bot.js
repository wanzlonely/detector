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
  const callbackData = ctx.callbackQuery && ctx.callbackQuery.data || '';
  const navigationText = /^(⌖ DETECT|✧ BELI PREMIUM|◈ STATUS|♛ LEADERBOARD|♧ REFERRAL|✉︎ HUBUNGI ADMIN|♛ OWNER CONSOLE|✚ AKTIVASI PREMIUM|▤ BROADCAST|\/start(?:@\w+)?(?:\s.*)?|\/store(?:@\w+)?|\/detect(?:@\w+)?|\/admin(?:@\w+)?|\/cancel)$/i.test(messageText);
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

// Reply Keyboard selalu dipasang pada balasan biasa; katalog memakai inline button.
bot.use((ctx, next) => {
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
    [
      Markup.button.callback('↶ KEMBALI KE PAKET', 'store:premium')
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

// Semua navigasi tersedia melalui Reply Keyboard sesuai peran akun.
bot.telegram.deleteMyCommands().catch((err) => console.error('[delete commands]', err && err.message || err));

bot.start(async (ctx) => {
  const payload = String(ctx.startPayload || '');
  if (payload.startsWith('ref_')) {
    const registered = await registerReferral(ctx.from.id, payload.slice(4));
    if (registered) await ctx.reply('♧ Kamu bergabung melalui tautan undangan. Selesaikan 3 pemeriksaan pertama agar pengundang memperoleh 5 koin referral.');
  }
  return showHome(ctx);
});
/* detect command moved to full handler */
bot.command('store', (ctx) => showStore(ctx, false));

bot.action(/^store:(?:premium|standard|ultra)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  return showStore(ctx, true);
});
bot.action(/^pkg:([a-z0-9_]+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const pkg = getPackageById(ctx.match[1]);
  if (!pkg) return ctx.reply('⚠️ <b>PAKET TIDAK DITEMUKAN</b>\nPilihan paket ini mungkin sudah tidak tersedia. Silakan buka kembali katalog Premium dan pilih paket yang aktif.');
  return showPackage(ctx, pkg, true);
});
bot.action(/^buy:([a-z0-9_]+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const pkg = getPackageById(ctx.match[1]);
  if (!pkg) return ctx.reply('⚠️ <b>PAKET TIDAK DITEMUKAN</b>\nSilakan buka kembali katalog Premium untuk melihat pilihan yang tersedia.');
  return showCheckout(ctx, pkg, true);
});
async function startContact(ctx) {
  await redis.set('contact:state:' + ctx.from.id, 'waiting', { ex: 600 });
  return ctx.reply('✦ <b>ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ</b>\n\nᴛᴜʟɪs ᴘᴇsᴀɴ ᴀᴛᴀᴜ ᴋᴇʟᴜʜᴀɴ ᴀɴᴅᴀ, ʙᴏᴛ ᴀᴋᴀɴ ᴍᴇɴᴇʀᴜsᴋᴀɴɴʏᴀ ʟᴀɴɢsᴜɴɢ ᴋᴇ ᴀᴅᴍɪɴ ᴍᴇᴛᴀᴅᴇᴛᴇᴄᴛ.\n\nᴋʟɪᴋ ᴛᴏᴍʙᴏʟ ᴅɪ ʙᴀᴡᴀʜ ᴜɴᴛᴜᴋ ᴍᴇᴍʙᴀᴛᴀʟᴋᴀɴ.', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('× BATALKAN', 'contact:cancel')]]) });
}
bot.hears('✉︎ HUBUNGI ADMIN', startContact);
bot.action(/^contact:(?!cancel$|reply:)([a-z0-9_]+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  return startContact(ctx);
});
bot.action(/^contact:reply:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!isOwner(ctx)) return ctx.answerCbQuery('Akses owner diperlukan.', { show_alert: true });
  const targetId = ctx.match[1];
  await redis.set('owner:contact:target:' + ctx.from.id, targetId, { ex: 600 });
  return ctx.reply('↩ <b>ᴍᴏᴅᴇ ʙᴀʟᴀs ᴘᴇsᴀɴ</b>\n\nᴛᴜᴊᴜᴀɴ ⦂ <code>' + targetId + '</code>\nᴋɪʀɪᴍ ʙᴀʟᴀsᴀɴ ᴀɴᴅᴀ ᴅᴀʟᴀᴍ 10 ᴍᴇɴɪᴛ.\n\nᴋᴇᴛɪᴋ /cancel ᴜɴᴛᴜᴋ ᴍᴇᴍʙᴀᴛᴀʟᴋᴀɴ.', { parse_mode: 'HTML' });
});
bot.action('contact:cancel', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await redis.del('contact:state:' + ctx.from.id);
  return ctx.reply('✕ <b>ᴘᴇɴɢɪʀɪᴍᴀɴ ᴘᴇsᴀɴ ᴅɪʙᴀᴛᴀʟᴋᴀɴ</b>', { parse_mode: 'HTML' });
});


function renderOwnerConsole(stats) {
  return [
    '♛ <b>ᴏᴡɴᴇʀ ᴄᴏɴsᴏʟᴇ</b> ♛',
    'ᴍᴇᴛᴀᴅᴇᴛᴇᴄᴛ · ᴄᴏɴᴛʀᴏʟ ᴘᴀɴᴇʟ',
    '',
    '▸ ᴘᴇɴɢɢᴜɴᴀ ⦂ <code>' + stats.totalUsers + '</code>',
    '▸ ᴘʀᴇᴍɪᴜᴍ ᴀᴋᴛɪғ ⦂ <code>' + stats.activeVip + '</code>',
    '▸ ᴛᴏᴛᴀʟ ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ ⦂ <code>' + stats.totalChecks + '</code>',
    '▸ ᴅɪᴀɢɴᴏsᴛɪᴋ ᴇᴋsᴛᴇʀɴᴀʟ ⦂ <b>ᴀᴋᴛɪғ</b>',
    '',
    '◈ ᴏᴡɴᴇʀ ᴍᴏᴅᴇ · ᴀᴋᴛɪғ'
  ].join('\n');
}

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
  return ctx.reply(require('./themes').renderReferral({ link, stats }), { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.url('⇧ BAGIKAN TAUTAN', shareUrl)], [Markup.button.callback('◈ TUKAR KOIN', 'referral:menu')]]) });
}
bot.hears('◈ STATUS', showStatus);
bot.hears('♛ LEADERBOARD', showLeaderboard);
bot.hears('♧ REFERRAL', showReferral);
bot.action('referral:menu', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const stats = await getReferralStats(ctx.from.id);
  return ctx.reply(require('./themes').renderReferralExchange(stats), { parse_mode: 'HTML', ...Markup.inlineKeyboard([
    [Markup.button.callback('5 KOIN · +10 KUOTA', 'referral:redeem:quota10')],
    [Markup.button.callback('15 KOIN · PREMIUM 3 HARI', 'referral:redeem:vip3')],
    [Markup.button.callback('30 KOIN · PREMIUM 7 HARI', 'referral:redeem:vip7')],
    [Markup.button.callback('100 KOIN · PREMIUM 30 HARI', 'referral:redeem:vip30')]
  ]) });
});
bot.action(/^referral:redeem:(quota10|vip3|vip7|vip30)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const offers = { quota10:{cost:5,type:'quota',amount:10,label:'+10 ᴋᴜᴏᴛᴀ ᴅᴇᴛᴇᴋsɪ'}, vip3:{cost:15,type:'vip',amount:3,label:'ᴘʀᴇᴍɪᴜᴍ 3 ʜᴀʀɪ'}, vip7:{cost:30,type:'vip',amount:7,label:'ᴘʀᴇᴍɪᴜᴍ 7 ʜᴀʀɪ'}, vip30:{cost:100,type:'vip',amount:30,label:'ᴘʀᴇᴍɪᴜᴍ 30 ʜᴀʀɪ'} };
  const offer=offers[ctx.match[1]];
  const result=await redeemReferralReward(ctx.from.id,offer);
  if(!result.ok) return ctx.reply('✕ <b>ᴋᴏɪɴ ᴛɪᴅᴀᴋ ᴍᴇɴᴄᴜᴋᴜᴘɪ</b>\n\nsᴀʟᴅᴏ ᴀɴᴅᴀ ⦂ '+result.balance+' ᴋᴏɪɴ\nᴅɪʙᴜᴛᴜʜᴋᴀɴ ⦂ '+offer.cost+' ᴋᴏɪɴ\n\nᴜɴᴅᴀɴɢ ʟᴇʙɪʜ ʙᴀɴʏᴀᴋ ᴛᴇᴍᴀɴ ᴜɴᴛᴜᴋ ᴍᴇɴᴅᴀᴘᴀᴛᴋᴀɴ ᴛᴀᴍʙᴀʜᴀɴ ᴋᴏɪɴ.',{parse_mode:'HTML'});
  return ctx.reply('✓ <b>ᴘᴇɴᴜᴋᴀʀᴀɴ ʙᴇʀʜᴀsɪʟ</b>\n\nᴘᴀᴋᴇᴛ ⦂ '+offer.label+'\nsɪsᴀ ᴋᴏɪɴ ⦂ '+result.balance+' ᴋᴏɪɴ\n\n'+(offer.type==='vip'?'ᴀᴋsᴇs ᴛᴇʟᴀʜ ᴀᴋᴛɪꜰ ᴏᴛᴏᴍᴀᴛɪs ᴅɪ ᴀᴋᴜɴ ᴀɴᴅᴀ.':'ᴋᴜᴏᴛᴀ ᴛᴀᴍʙᴀʜᴀɴ ᴛᴇʟᴀʜ ᴅɪᴛᴀᴍʙᴀʜᴋᴀɴ ᴋᴇ ᴀᴋᴜɴ ᴀɴᴅᴀ.'),{parse_mode:'HTML'});
});

bot.hears('♛ OWNER CONSOLE', async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply('⊘ <b>ᴀᴋsᴇs ᴛɪᴅᴀᴋ ᴅɪɪᴢɪɴᴋᴀɴ</b>\nғɪᴛᴜʀ ɪɴɪ ʜᴀɴʏᴀ ᴅᴀᴘᴀᴛ ᴅɪɢᴜɴᴀᴋᴀɴ ᴏʟᴇʜ ᴏᴡɴᴇʀ ᴍᴇᴛᴀ ᴅᴇᴛᴇᴄᴛ.');
  const stats = await getGlobalStats();
  return ctx.reply(renderOwnerConsole(stats), { parse_mode: 'HTML' });
});
bot.hears('✚ AKTIVASI PREMIUM', async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply('⊘ <b>ᴀᴋsᴇs ᴏᴡɴᴇʀ ᴅɪᴘᴇʀʟᴜᴋᴀɴ</b>\nғɪᴛᴜʀ ɪɴɪ ʜᴀɴʏᴀ ᴅᴀᴘᴀᴛ ᴅɪɢᴜɴᴀᴋᴀɴ ᴏʟᴇʜ ᴘᴇᴍɪʟɪᴋ ʙᴏᴛ.', { parse_mode: 'HTML' });
  await setOwnerAction(ctx.from.id, 'activate');
  return ctx.reply(`✦ ᴀᴋᴛɪᴠᴀsɪ ᴘʀᴇᴍɪᴜᴍ ✦\n\nᴍᴀsᴜᴋᴋᴀɴ ɪᴅ ᴛᴇʟᴇɢʀᴀᴍ & ᴅᴜʀᴀsɪ ʜᴀʀɪ\nᴅᴇɴɢᴀɴ ᴘᴇᴍɪsᴀʜ sᴘᴀsɪ.\n\nᴄᴏɴᴛᴏʜ ⦂ <code>123456789 7</code>\n\nᴋʟɪᴋ ᴛᴏᴍʙᴏʟ ᴅɪ ʙᴀᴡᴀʜ ᴜɴᴛᴜᴋ ᴍᴇᴍʙᴀᴛᴀʟᴋᴀɴ`, { parse_mode: 'HTML' });
});
bot.hears('▤ BROADCAST', async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply('⊘ <b>ᴀᴋsᴇs ᴏᴡɴᴇʀ ᴅɪᴘᴇʀʟᴜᴋᴀɴ</b>\nғɪᴛᴜʀ ɪɴɪ ʜᴀɴʏᴀ ᴅᴀᴘᴀᴛ ᴅɪɢᴜɴᴀᴋᴀɴ ᴏʟᴇʜ ᴘᴇᴍɪʟɪᴋ ʙᴏᴛ.', { parse_mode: 'HTML' });
  await setOwnerAction(ctx.from.id, 'broadcast');
  return ctx.reply('▤ <b>ᴍᴏᴅᴇ ʙʀᴏᴀᴅᴄᴀsᴛ</b>\n\nᴋɪʀɪᴍ ɪsɪ ᴘᴇɴɢᴜᴍᴜᴍᴀɴ ʏᴀɴɢ ɪɴɢɪɴ ᴅɪsᴀᴍᴘᴀɪᴋᴀɴ ᴋᴇ sᴇᴍᴜᴀ ᴘᴇɴɢɢᴜɴᴀ.', { parse_mode: 'HTML' });
});
bot.command('admin', async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply('⊘ <b>ᴀᴋsᴇs ᴏᴡɴᴇʀ ᴅɪᴘᴇʀʟᴜᴋᴀɴ</b>\nғɪᴛᴜʀ ɪɴɪ ʜᴀɴʏᴀ ᴅᴀᴘᴀᴛ ᴅɪɢᴜɴᴀᴋᴀɴ ᴏʟᴇʜ ᴘᴇᴍɪʟɪᴋ ʙᴏᴛ.', { parse_mode: 'HTML' });
  const stats = await getGlobalStats();
  return ctx.reply(renderOwnerConsole(stats), { parse_mode: 'HTML' });
});
bot.command('addvip', async (ctx) => {
  if (!isOwner(ctx)) return;
  const parts = ctx.message.text.trim().split(/\s+/);
  const uid = Number(parts[1]);
  const hasLegacyTier = ['STANDARD', 'ULTRA', 'PREMIUM'].includes(String(parts[2] || '').toUpperCase());
  const days = Number(hasLegacyTier ? parts[3] : parts[2]);
  if (!Number.isSafeInteger(uid) || uid <= 0 || !Number.isSafeInteger(days) || days <= 0 || days > 3650) {
    return ctx.reply('✚ <b>FORMAT AKTIVASI BELUM TEPAT</b>\nGunakan format <code>ID_TELEGRAM DURASI_HARI</code>.\nContoh: <code>123456789 7</code>.', { parse_mode: 'HTML' });
  }
  const result = await activateVip(uid, days, 'PREMIUM', 'PREMIUM · ' + days + ' Hari');
      return ctx.reply('✦ <b>ᴀᴋᴛɪᴠᴀsɪ ʙᴇʀʜᴀsɪʟ</b> ✦\n\nᴘʀᴇᴍɪᴜᴍ ᴛᴇʟᴀʜ ᴀᴋᴛɪғ ᴜɴᴛᴜᴋ <code>' + uid + '</code>.\nᴍᴀsᴀ ᴀᴋᴛɪғ ʙᴇʀᴀᴋʜɪʀ ⦂ <code>' + formatDateWIB(result.expiry) + '</code>\n\n◈ sᴛᴀᴛᴜs ⦂ ᴀᴋᴛɪғ', { parse_mode: 'HTML' });
});

bot.command('broadcast', async (ctx) => {
  if (!isOwner(ctx)) return;
  const message = ctx.message.text.replace(/^\/broadcast\s*/i, '').trim();
  if (!message) return ctx.reply('▤ <b>ᴘᴇsᴀɴ ʙʀᴏᴀᴅᴄᴀsᴛ ᴋᴏsᴏɴɢ</b>\n\nᴛᴜʟɪs ɪsɪ ᴘᴇɴɢᴜᴍᴜᴍᴀɴ ʏᴀɴɢ ɪɴɢɪɴ ᴅɪᴋɪʀɪᴍ, ᴀᴛᴀᴜ ɢᴜɴᴀᴋᴀɴ ᴛᴏᴍʙᴏʟ ʙʀᴏᴀᴅᴄᴀsᴛ.');
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
      return ctx.reply('✦ <b>ʙʀᴏᴀᴅᴄᴀsᴛ sᴇʟᴇsᴀɪ</b> ✦\n\nᴘᴇsᴀɴ ᴛᴇʀᴋɪʀɪᴍ ⦂ <b>' + sent + '</b> / <b>' + stats.allUserIds.length + '</b> ᴘᴇɴɢɢᴜɴᴀ.\n<i>ᴀᴋᴜɴ ʏᴀɴɢ ᴛɪᴅᴀᴋ ᴅᴀᴘᴀᴛ ᴅɪʜᴜʙᴜɴɢɪ ᴍᴜɴɢᴋɪɴ ᴛɪᴅᴀᴋ ᴍᴇɴᴇʀɪᴍᴀ ᴘᴇsᴀɴ.</i>');
});


// ===================== DETECT FEATURE (re-enabled + improved) =====================

function extractPhoneCandidates(text) {
  if (!text) return [];
  const lines = String(text).split(/[\n,;]+/).map(l => l.trim()).filter(Boolean);
  const phones = [];
  const seen = new Set();
  for (const line of lines) {
    // simple cleanup
    let cleaned = line.replace(/[^\d+\-\s().]/g, '').trim();
    if (!cleaned) continue;
    // keep only reasonable length candidates
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) continue;
    const key = digits;
    if (seen.has(key)) continue;
    seen.add(key);
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
      '⚠️ <b>ᴋᴜᴏᴛᴀ ʜᴀʀɪᴀɴ ʜᴀʙɪs</b>\n\n' +
      'ᴀɴᴅᴀ ᴛᴇʟᴀʜ ᴍᴇɴɢɢᴜɴᴀᴋᴀɴ 3 ᴋᴜᴏᴛᴀ ɢʀᴀᴛɪs ʜᴀʀɪ ɪɴɪ.\n' +
      'ᴜᴘɢʀᴀᴅᴇ ᴋᴇ ᴘʀᴇᴍɪᴜᴍ ᴜɴᴛᴜᴋ ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ ᴛᴀɴᴘᴀ ʙᴀᴛᴀs.',
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('✧ BELI PREMIUM', 'store:premium')]]) }
    );
  }

  await redis.set('detect:mode:' + ctx.from.id, 'waiting_numbers', { ex: 300 });

  const limitHint = isVip ? 'ᴍᴀᴋsɪᴍᴀʟ 30 ɴᴏᴍᴏʀ / ᴋɪʀɪᴍᴀɴ' : '1 ɴᴏᴍᴏʀ (ғʀᴇᴇ)';
  return ctx.reply(
    '⌖ <b>ᴅᴇᴛᴇᴋsɪ ɴᴏᴍᴏʀ ᴡʜᴀᴛsᴀᴘᴘ</b>\n\n' +
    'ᴋɪʀɪᴍ ɴᴏᴍᴏʀ ʏᴀɴɢ ɪɴɢɪɴ ᴅɪᴘᴇʀɪᴋsᴀ.\n' +
    'ʙɪsᴀ sᴀᴛᴜ ɴᴏᴍᴏʀ ᴀᴛᴀᴜ ʙᴇʀᴇᴛɪs (ᴍᴀx ' + (isVip ? '30' : '1') + ').\n\n' +
    'ᴄᴏɴᴛᴏʜ:\n<code>+6281234567890</code>\n<code>081234567890</code>\n\n' +
    '▸ ᴋᴜᴏᴛᴀ ⦂ <b>' + (isVip ? 'ᴛᴀɴᴘᴀ ʙᴀᴛᴀs' : remaining + ' / 3') + '</b>\n' +
    '▸ ʟɪᴍɪᴛ ⦂ <b>' + limitHint + '</b>\n\n' +
    'ᴋᴇᴛɪᴋ /cancel ᴜɴᴛᴜᴋ ᴍᴇᴍʙᴀᴛᴀʟᴋᴀɴ.',
    { parse_mode: 'HTML' }
  );
}

async function processDetection(ctx, rawText) {
  const userId = ctx.from.id;
  const user = await getEffectiveUser(ctx);
  const isVip = isOwner(ctx) || isUserVip(user);
  const bulkLimit = isVip ? 30 : 1;

  let phones = extractPhoneCandidates(rawText);
  if (phones.length === 0) {
    return ctx.reply('⚠️ <b>ɴᴏᴍᴏʀ ᴛɪᴅᴀᴋ ᴅɪᴛᴇᴍᴜᴋᴀɴ</b>\n\nᴋɪʀɪᴍ ɴᴏᴍᴏʀ ᴅᴇɴɢᴀɴ ғᴏʀᴍᴀᴛ ʏᴀɴɢ ʙᴇɴᴀʀ.\nᴄᴏɴᴛᴏʜ: <code>+6281234567890</code>', { parse_mode: 'HTML' });
  }

  if (phones.length > bulkLimit) {
    phones = phones.slice(0, bulkLimit);
    await ctx.reply('ℹ️ Hanya ' + bulkLimit + ' nomor pertama yang akan diproses (batas akun Anda).', { parse_mode: 'HTML' });
  }

  // Quota check for free users
  if (!isVip) {
    const ok = await consumeQuota(userId, phones.length);
    if (!ok) {
      return ctx.reply('⚠️ <b>ᴋᴜᴏᴛᴀ ᴛɪᴅᴀᴋ ᴄᴜᴋᴜᴘ</b>\n\nᴀɴᴅᴀ ᴛɪᴅᴀᴋ ᴍᴇᴍɪʟɪᴋɪ ᴋᴜᴏᴛᴀ ʏᴀɴɢ ᴄᴜᴋᴜᴘ ᴜɴᴛᴜᴋ ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ ɪɴɪ.', { parse_mode: 'HTML' });
    }
  } else {
    // still count for leaderboard
    await consumeQuota(userId, phones.length);
  }

  const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await redis.set('detect:active:' + userId, jobId, { ex: 600 });

  const statusMsg = await ctx.reply(
    '⟳ <b>ᴍᴇᴍᴘʀᴏsᴇs ' + phones.length + ' ɴᴏᴍᴏʀ...</b>\n\n' +
    'ᴍᴏʜᴏɴ ᴛᴜɴɢɢᴜ, ʜᴀsɪʟ ᴀᴋᴀɴ ᴅɪᴋɪʀɪᴍ sᴇᴛᴇʟᴀʜ sᴇʟᴇsᴀɪ.',
    { parse_mode: 'HTML' }
  );

  const results = [];
  const startTs = Date.now();

  for (let i = 0; i < phones.length; i++) {
    // check stop signal
    const stopFlag = await redis.get('detect:stop:' + userId + ':' + jobId);
    if (stopFlag) {
      await ctx.reply('✕ Pemeriksaan dihentikan.', { parse_mode: 'HTML' });
      break;
    }

    const phone = phones[i];
    try {
      // cache first
      let result = await getCachedCheckResult(phone);
      if (!result) {
        result = await checkWhatsAppCooldown(phone);
        await setCachedCheckResult(phone, result);
      }

      results.push({ number: result.formattedNumber || phone, result });

      // log
      const summary = result.isBanned ? 'BANNED' :
        result.isCloneBlocked ? 'CLONE_BLOCK' :
        result.anyCooldown ? 'COOLDOWN' :
        result.isReady ? 'READY' : (result.accountStatus || 'UNKNOWN');
      await addCheckLog(userId, result.formattedNumber || phone, summary, result.proxyTag);

      // single number → rich card
      if (phones.length === 1) {
        const card = renderCooldownCard({ result, user, isVip });
        await ctx.reply(card, { parse_mode: 'HTML' });
      }
    } catch (err) {
      console.error('[detect]', phone, err && err.message || err);
      results.push({ number: phone, error: err && err.message || 'Gagal memproses' });
    }

    // small progress for multi
    if (phones.length > 1 && (i + 1) % 5 === 0) {
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          '⟳ <b>ᴍᴇᴍᴘʀᴏsᴇs...</b> ' + (i + 1) + '/' + phones.length,
          { parse_mode: 'HTML' }
        );
      } catch (_) {}
    }
  }

  await redis.del('detect:active:' + userId);
  await redis.del('detect:mode:' + userId);

  // qualify referral if applicable
  try {
    const refResult = await qualifyReferral(userId);
    if (refResult && refResult.rewarded) {
      // silent or notify inviter later
    }
  } catch (_) {}

  const elapsed = Math.round((Date.now() - startTs) / 1000);

  if (phones.length > 1) {
    const summary = renderDetectionSummary({ results, elapsedSeconds: elapsed });
    await ctx.reply(summary, { parse_mode: 'HTML' });
  } else if (results.length === 1 && results[0].error) {
    await ctx.reply('⚠️ <b>ɢᴀɢᴀʟ ᴍᴇᴍᴘʀᴏsᴇs</b>\n\n' + escapeHtml(results[0].error), { parse_mode: 'HTML' });
  }

  // cleanup status message for multi
  if (phones.length > 1) {
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
    } catch (_) {}
  }
}

// Command + keyboard entry
bot.command('detect', startDetect);
bot.hears('⌖ DETECT', startDetect);


bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (!text) return;

  // Detect mode: user is expected to send numbers
  const detectMode = await redis.get('detect:mode:' + ctx.from.id);
  if (detectMode === 'waiting_numbers') {
    if (text === '/cancel' || text.toLowerCase() === 'batal' || text.toLowerCase() === 'cancel') {
      await redis.del('detect:mode:' + ctx.from.id);
      return ctx.reply('✕ <b>ᴅᴇᴛᴇᴋsɪ ᴅɪʙᴀᴛᴀʟᴋᴀɴ</b>', { parse_mode: 'HTML' });
    }
    // ignore pure menu presses (already handled above)
    if (/^(⌖ DETECT|✧ BELI PREMIUM|◈ STATUS|♛ LEADERBOARD|♧ REFERRAL|✉︎ HUBUNGI ADMIN)/i.test(text)) {
      return;
    }
    await redis.del('detect:mode:' + ctx.from.id);
    return processDetection(ctx, text);
  }

  if (isOwner(ctx) && ctx.message.reply_to_message) {
    const targetId = await redis.get('contact:message:' + ctx.message.reply_to_message.message_id);
    if (targetId) {
      await bot.telegram.sendMessage(Number(targetId), '✦ <b>ʙᴀʟᴀsᴀɴ ᴀᴅᴍɪɴ</b>\n\n┃ ' + escapeHtml(text) + '\n\nᴋɪʀɪᴍ ᴘᴇsᴀɴ ʟᴀɢɪ ᴊɪᴋᴀ ɪɴɢɪɴ ᴍᴇᴍʙᴀʟᴀs.', { parse_mode: 'HTML' });
      return ctx.reply('✓ <b>ʙᴀʟᴀsᴀɴ ᴛᴇʀᴋɪʀɪᴍ ᴋᴇ ᴘᴇɴɢɢᴜɴᴀ</b>', { parse_mode: 'HTML' });
    }
  }
  if (isOwner(ctx)) {
    const targetId = await redis.get('owner:contact:target:' + ctx.from.id);
    if (targetId) {
      if (text === '/cancel' || text.toUpperCase() === 'BATAL') {
        await redis.del('owner:contact:target:' + ctx.from.id);
        return ctx.reply('✕ <b>ʙᴀʟᴀsᴀɴ ᴅɪʙᴀᴛᴀʟᴋᴀɴ</b>', { parse_mode: 'HTML' });
      }
      await bot.telegram.sendMessage(Number(targetId), '✦ <b>ʙᴀʟᴀsᴀɴ ᴀᴅᴍɪɴ</b>\n\n┃ ' + escapeHtml(text) + '\n\nᴋɪʀɪᴍ ᴘᴇsᴀɴ ʟᴀɢɪ ᴊɪᴋᴀ ɪɴɢɪɴ ᴍᴇᴍʙᴀʟᴀs.', { parse_mode: 'HTML' });
      await redis.del('owner:contact:target:' + ctx.from.id);
      return ctx.reply('✓ <b>ʙᴀʟᴀsᴀɴ ᴛᴇʀᴋɪʀɪᴍ</b>\nᴛᴜᴊᴜᴀɴ ⦂ <code>' + targetId + '</code>', { parse_mode: 'HTML' });
    }
  }
  if (await redis.get('contact:state:' + ctx.from.id)) {
    await redis.del('contact:state:' + ctx.from.id);
    if (!ADMIN_ID) return ctx.reply('✕ ᴀᴅᴍɪɴ ʙᴇʟᴜᴍ ᴅɪᴀᴛᴜʀ.');
    const sender = ctx.from.username ? '@' + ctx.from.username : (ctx.from.first_name || 'Pengguna');
    const forwarded = await bot.telegram.sendMessage(ADMIN_ID, '✉ <b>ᴘᴇsᴀɴ ᴍᴀsᴜᴋ</b>\n\nᴅᴀʀɪ ⦂ ' + escapeHtml(sender) + '\nɪᴅ ⦂ <code>' + ctx.from.id + '</code>\n\n┃ ' + escapeHtml(text) + '\n\n<i>Gunakan tombol di bawah agar balasan terkirim ke akun yang tepat.</i>', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('↩ BALAS PENGGUNA · ' + String(ctx.from.id), 'contact:reply:' + ctx.from.id)]]) });
    if (forwarded && forwarded.message_id) {
      await redis.set('contact:message:' + forwarded.message_id, String(ctx.from.id), { ex: 86400 });
    }
    return ctx.reply('✓ <b>ᴘᴇsᴀɴ ᴛᴇʀᴋɪʀɪᴍ</b>\n\nᴘᴇsᴀɴ ᴀɴᴅᴀ ᴛᴇʟᴀʜ ᴅɪᴛᴇʀᴜsᴋᴀɴ ᴋᴇ ᴀᴅᴍɪɴ. ᴍᴏʜᴏɴ ᴛᴜɴɢɢᴜ ʙᴀʟᴀsᴀɴ ᴅɪ sɪɴɪ.', { parse_mode: 'HTML' });
  }
  if (text === '⌖ DETECT' || text === '⌖ Detect' || text === 'Detect') {
    return startDetect(ctx);
  }
  if (text === '✧ BELI PREMIUM' || text === '✧ Beli Premium' || text === 'Beli Premium') {
    return showStore(ctx, false);
  }
  if (isOwner(ctx)) {
    const action = await getOwnerAction(ctx.from.id);
    if (action === 'activate') {
      const [uidText, daysText] = text.trim().split(/\s+/);
      const uid = Number(uidText);
      const days = Number(daysText);
      if (!Number.isSafeInteger(uid) || uid <= 0 || !Number.isFinite(days) || days <= 0 || days > 3650) {
        return ctx.reply('✦ <b>ғᴏʀᴍᴀᴛ ᴀᴋᴛɪᴠᴀsɪ ᴛɪᴅᴀᴋ ᴛᴇᴘᴀᴛ</b>\n\nᴋɪʀɪᴍ ɪᴅ ᴛᴇʟᴇɢʀᴀᴍ ᴅᴀɴ ᴅᴜʀᴀsɪ ʜᴀʀɪ ᴅᴇɴɢᴀɴ ᴘᴇᴍɪsᴀʜ sᴘᴀsɪ.\nᴄᴏɴᴛᴏʜ ⦂ <code>123456789 7</code>', { parse_mode: 'HTML' });
      }
      const activated = await activateVip(uid, days, 'PREMIUM', 'PREMIUM · ' + days + ' Hari');
      await clearOwnerAction(ctx.from.id);
      return ctx.reply('✦ <b>ᴀᴋᴛɪᴠᴀsɪ ʙᴇʀʜᴀsɪʟ</b> ✦\n\nᴘʀᴇᴍɪᴜᴍ ᴛᴇʟᴀʜ ᴀᴋᴛɪғ ᴜɴᴛᴜᴋ <code>' + uid + '</code>.\nᴍᴀsᴀ ᴀᴋᴛɪғ ʙᴇʀᴀᴋʜɪʀ ⦂ <code>' + formatDateWIB(activated.expiry) + '</code>\n\n◈ sᴛᴀᴛᴜs ⦂ ᴀᴋᴛɪғ', { parse_mode: 'HTML' });
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
      return ctx.reply('✦ <b>ʙʀᴏᴀᴅᴄᴀsᴛ sᴇʟᴇsᴀɪ</b> ✦\n\nᴘᴇsᴀɴ ᴛᴇʀᴋɪʀɪᴍ ⦂ <b>' + sent + '</b> / <b>' + stats.allUserIds.length + '</b> ᴘᴇɴɢɢᴜɴᴀ.\n<i>ᴀᴋᴜɴ ʏᴀɴɢ ᴛɪᴅᴀᴋ ᴅᴀᴘᴀᴛ ᴅɪʜᴜʙᴜɴɢɪ ᴍᴜɴɢᴋɪɴ ᴛɪᴅᴀᴋ ᴍᴇɴᴇʀɪᴍᴀ ᴘᴇsᴀɴ.</i>');
    }
  }

  return ctx.reply('⌁ <b>ᴘᴇʀɪɴᴛᴀʜ ᴛɪᴅᴀᴋ ᴅɪᴋᴇɴᴀʟ</b>\n\nᴘɪʟɪʜ sᴀʟᴀʜ sᴀᴛᴜ ᴍᴇɴᴜ ʏᴀɴɢ ᴛᴇʀsᴇᴅɪᴀ ᴅɪ ʙᴀᴡᴀʜ.', { parse_mode: 'HTML' });
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
