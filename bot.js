require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const {
  redis, getPackagesByTier, getPackageById, getOrCreateUser, isUserVip,
  consumeQuota, addCheckLog, getGlobalStats, getCachedCheckResult,
  setCachedCheckResult, incrementUserChecks, activateVip, registerReferral, qualifyReferral, getReferralStats, getLeaderboard, redeemReferralReward
} = require('./database');
const { isDataImpulseConfigured } = require('./proxyManager');
const { checkWhatsAppCooldown } = require('./waChecker');
const {
  escapeHtml, formatIDR, formatDateWIB, renderDashboard, renderStoreCatalog,
  renderPackageDetailCard, renderPaymentMaintenanceCard, renderCooldownCard, renderDetectionSummary
} = require('./themes');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = Number(process.env.ADMIN_ID || 0);
const BRAND_NAME = process.env.BRAND_NAME || 'META DETECT';
const USER_KEYBOARD = Markup.keyboard([
  [{ text: '⌖ DETECT' }, { text: '✧ BELI PREMIUM' }],
  [{ text: '◈ STATUS' }, { text: '♛ LEADERBOARD' }],
  [{ text: '♧ REFERRAL' }]
]).resize().persistent().placeholder('Pilih menu…');

const OWNER_KEYBOARD = Markup.keyboard([
  [{ text: '⌖ DETECT' }, { text: '✧ BELI PREMIUM' }],
  [{ text: '◈ STATUS' }, { text: '♛ LEADERBOARD' }],
  [{ text: '♧ REFERRAL' }],
  [{ text: '♛ OWNER CONSOLE' }],
  [{ text: '✚ AKTIVASI PREMIUM' }, { text: '▤ BROADCAST' }]
]).resize().persistent().placeholder('Pilih fungsi owner…');

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
  if (typeof ctx.reply === 'function') {
    const originalReply = ctx.reply.bind(ctx);
    ctx.reply = (message, extra = {}) => originalReply(message, {
      ...extra,
      ...(!extra.reply_markup ? (isOwner(ctx) ? OWNER_KEYBOARD : USER_KEYBOARD) : {})
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
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⌁ HUBUNGI ADMIN', 'contact:' + pkg.id)],
    [
      Markup.button.callback('↶ PILIH PAKET LAIN', 'store:' + pkg.tier)
    ]
  ]);
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
bot.command('detect', (ctx) => ctx.reply(
  '⌖ <b>ᴍᴏᴅᴇ ᴅᴇᴛᴇᴄᴛ sɪᴀᴘ</b> ⌖\n\nᴋɪʀɪᴍ ɴᴏᴍᴏʀ ᴡʜᴀᴛsᴀᴘᴘ ᴅᴇɴɢᴀɴ ᴋᴏᴅᴇ ɴᴇɢᴀʀᴀ\n\n\nᴄᴏɴᴛᴏʜ ⦂\n<code>6282298902274\n6281234567890</code>',
  { parse_mode: 'HTML' }
));
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
bot.action(/^contact:(?!cancel$)([a-z0-9_]+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await redis.set('contact:state:' + ctx.from.id, 'waiting', { ex: 600 });
  return ctx.reply('✦ <b>ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ</b>\n\nᴛᴜʟɪs ᴘᴇsᴀɴ ᴀᴛᴀᴜ ᴋᴇʟᴜʜᴀɴ ᴀɴᴅᴀ, ʙᴏᴛ ᴀᴋᴀɴ ᴍᴇɴᴇʀᴜsᴋᴀɴɴʏᴀ ʟᴀɴɢsᴜɴɢ ᴋᴇ ᴀᴅᴍɪɴ ᴍᴇᴛᴀᴅᴇᴛᴇᴄᴛ.\n\nᴋʟɪᴋ ᴛᴏᴍʙᴏʟ ᴅɪ ʙᴀᴡᴀʜ ᴜɴᴛᴜᴋ ᴍᴇᴍʙᴀᴛᴀʟᴋᴀɴ.', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('× BATALKAN', 'contact:cancel')]]) });
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
    '▸ ᴅᴀᴛᴀɪᴍᴘᴜʟsᴇ ⦂ <b>' + (isDataImpulseConfigured() ? '● ᴛᴇʀʜᴜʙᴜɴɢ' : 'ʙᴇʟᴜᴍ ᴅɪᴀᴛᴜʀ') + '</b>',
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
  if (!uid || !Number.isFinite(days) || days <= 0) {
    return ctx.reply('✚ <b>FORMAT AKTIVASI BELUM TEPAT</b>\nGunakan format <code>ID_TELEGRAM DURASI_HARI</code>.\nContoh: <code>123456789 7</code>.', { parse_mode: 'HTML' });
  }
  const result = await activateVip(uid, days, 'PREMIUM', 'PREMIUM · ' + days + ' Hari');
      return ctx.reply('✦ <b>ᴀᴋᴛɪᴠᴀsɪ ʙᴇʀʜᴀsɪʟ</b> ✦\n\nᴘʀᴇᴍɪᴜᴍ ᴛᴇʟᴀʜ ᴀᴋᴛɪғ ᴜɴᴛᴜᴋ <code>' + uid + '</code>.\nᴍᴀsᴀ ᴀᴋᴛɪғ ʙᴇʀᴀᴋʜɪʀ ⦂ <code>' + formatDateWIB(activated.expiry) + '</code>\n\n◈ sᴛᴀᴛᴜs ⦂ ᴀᴋᴛɪғ', { parse_mode: 'HTML' });
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


function buildProgressText(done, total, stage, stats, frame = 0) {
  const percent = Math.min(100, Math.floor(done / Math.max(1, total) * 100));
  const filled = Math.floor(percent / 10);
  const bar = '●'.repeat(filled) + '○'.repeat(10 - filled);
  const spinner = ['◐', '◓', '◑', '◒'][frame % 4];
  const counts = stats || { ready: 0, cooldown: 0, banned: 0, error: 0 };
  return '⌖ <b>ᴅᴇᴛᴇᴄᴛ sᴇᴅᴀɴɢ ʙᴇʀᴊᴀʟᴀɴ</b>\n\n' + bar + ' <b>' + percent + '%</b>' +
    '\nᴛᴀʀɢᴇᴛ ⟿ <b>' + done + ' / ' + total + '</b>' +
    '\n\n✧ ʙᴇʀʜᴀsɪʟ — <b>' + counts.ready + '</b>' +
    '\n✕ ɢᴀɢᴀʟ — <b>' + (counts.error + counts.banned) + '</b>' +
    '\n  ◐ ᴄᴏᴏʟᴅᴏᴡɴ — <b>' + counts.cooldown + '</b>' +
    '\n  ⊘ ᴅɪʙᴀᴛᴀsɪ — <b>' + counts.banned + '</b>' +
    '\n\n' + spinner + ' ' + stage;
}
bot.action(/^detect:stop:(\d+):(\d+)$/, async (ctx) => {
  if (Number(ctx.from.id) !== Number(ctx.match[1])) return ctx.answerCbQuery('Sesi ini bukan milikmu.', { show_alert: true });
  await redis.set('detect:stop:' + ctx.match[1] + ':' + ctx.match[2], '1', { ex: 600 });
  return ctx.answerCbQuery('Permintaan berhenti diterima.');
});

async function processNumbers(ctx, numbersList) {
  const owner = isOwner(ctx);
  const user = await getEffectiveUser(ctx);
  const vip = owner || isUserVip(user);
  const maxBatch = owner ? 30 : (!vip ? 1 : Math.min(10, Number(user.bulk_limit || 10)));
  const premiumAccess = vip;

  if (numbersList.length > maxBatch) {
    return ctx.reply('◈ <b>ʙᴀᴛᴀs ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ</b>\nᴀᴋᴜɴᴍᴜ ᴅᴀᴘᴀᴛ ᴍᴇᴍᴇʀɪᴋsᴀ ᴍᴀᴋsɪᴍᴀʟ <b>' + maxBatch + ' ɴᴏᴍᴏʀ</b> ᴅᴀʟᴀᴍ sᴀᴛᴜ ᴋɪʀɪᴍᴀɴ.', { parse_mode: 'HTML' });
  }
  if (!owner) {
    const allowed = await consumeQuota(ctx.from.id, numbersList.length);
    if (!allowed) return ctx.reply('◈ <b>ᴋᴜᴏᴛᴀ ʜᴀʀɪᴀɴ ʜᴀʙɪs</b>\nᴋᴜᴏᴛᴀ ɢʀᴀᴛɪs 3 ᴘᴇᴍᴇʀɪᴋsᴀᴀɴᴍᴜ sᴜᴅᴀʜ ᴛᴇʀᴘᴀᴋᴀɪ. ᴋᴜᴏᴛᴀ ᴀᴋᴀɴ ᴅɪᴘᴇʀʙᴀʀᴜɪ ᴘᴜᴋᴜʟ 00.00 ᴡɪʙ.', { parse_mode: 'HTML' });
  } else {
    await incrementUserChecks(ctx.from.id, numbersList.length);
  }

  const jobId = String(Date.now());
  const stopKey = 'detect:stop:' + ctx.from.id + ':' + jobId;
  let completed = 0;
  const startedAt = Date.now();
  let stage = 'ᴍᴇɴʏɪᴀᴘᴋᴀɴ sᴇsɪ ᴅᴇᴛᴇᴄᴛ';
  let frame = 0;
  const stopMarkup = Markup.inlineKeyboard([[Markup.button.callback('× HENTIKAN DETEKSI', 'detect:stop:' + ctx.from.id + ':' + jobId)]]);
  const progress = await ctx.reply(buildProgressText(0, numbersList.length, stage, { ready: 0, cooldown: 0, banned: 0, error: 0 }), { parse_mode: 'HTML', ...stopMarkup });
  const timer = setInterval(() => {
    frame = (frame + 1) % 4;
    ctx.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, buildProgressText(completed, numbersList.length, stage, stats, frame), { parse_mode: 'HTML', ...stopMarkup }).catch(() => {});
  }, 2200);
  const stats = { ready: 0, cooldown: 0, banned: 0, error: 0 };
  const detectionResults = [];
  let lastReaction = '👀';
  let stopped = false;

  for (const rawNumber of numbersList) {
    if (await redis.get(stopKey)) { stopped = true; break; }
    stage = 'Memeriksa target ' + (completed + 1) + ' dari ' + numbersList.length;
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
      const reward = await qualifyReferral(ctx.from.id);
      if (reward.rewarded) await bot.telegram.sendMessage(reward.inviter, '♧ <b>ᴋᴏɪɴ ʀᴇғᴇʀᴀʟ ʙᴇʀᴛᴀᴍʙᴀʜ!</b>\n\nᴛᴇᴍᴀɴ ʏᴀɴɢ ᴋᴀᴍᴜ ᴜɴᴅᴀɴɢ ᴛᴇʟᴀʜ ᴍᴇɴʏᴇʟᴇsᴀɪᴋᴀɴ 3 ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ.\n✦ ʜᴀᴅɪᴀʜᴍᴜ ⦂ <b>+5 ᴋᴏɪɴ</b>', { parse_mode: 'HTML' }).catch(() => {});
      detectionResults.push({ number: result.formattedNumber, result });
    } catch (err) {
      stats.error += 1;
      lastReaction = '⚠️';
      console.error('[detect] target failed:', rawNumber, err && err.stack || err);
      const detail = /timeout|timed out/i.test(err && err.message || '')
        ? 'ᴋᴏɴᴇᴋsɪ ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ ᴍᴇʟᴇᴡᴀᴛɪ ʙᴀᴛᴀs ᴡᴀᴋᴛᴜ. ᴄᴏʙᴀ ʟᴀɢɪ ʙᴇʙᴇʀᴀᴘᴀ sᴀᴀᴛ.'
        : /429|rate.?limit|too many/i.test(err && err.message || '')
          ? 'sᴇʀᴠᴇʀ sᴇᴅᴀɴɢ ᴍᴇᴍʙᴀᴛᴀsɪ ᴘᴇʀᴍɪɴᴛᴀᴀɴ. ᴛᴜɴɢɢᴜ sᴇʙᴇɴᴛᴀʀ sᴇʙᴇʟᴜᴍ ᴍᴇɴᴄᴏʙᴀ ʟᴀɢɪ.'
          : 'ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ ᴛɪᴅᴀᴋ ᴅᴀᴘᴀᴛ ᴅɪᴘʀᴏsᴇs. sɪʟᴀᴋᴀɴ ᴄᴏʙᴀ ʟᴀɢɪ ɴᴀɴᴛɪ.';
      detectionResults.push({ number: rawNumber, error: true, detail });
    }
    completed += 1;
    stage = 'ᴍᴇᴍᴘᴇʀʙᴀʀᴜɪ ʜᴀsɪʟ ᴅᴇᴛᴇᴄᴛ';
    await ctx.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, buildProgressText(completed, numbersList.length, stage, stats, ++frame), { parse_mode: 'HTML', ...stopMarkup }).catch(() => {});
  }


  clearInterval(timer);
  await redis.del(stopKey).catch(() => {});
  const finalText = (stopped ? '× <b>ᴅᴇᴛᴇᴄᴛ ᴅɪʜᴇɴᴛɪᴋᴀɴ</b>' : '✓ <b>ᴅᴇᴛᴇᴄᴛ sᴇʟᴇsᴀɪ</b>') + '\n\n' + buildProgressText(completed, numbersList.length, stopped ? 'ᴅɪʜᴇɴᴛɪᴋᴀɴ ᴘᴇɴɢɢᴜɴᴀ' : 'sᴇʟᴜʀᴜʜ ᴛᴀʀɢᴇᴛ sᴇʟᴇsᴀɪ', stats);
  await ctx.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, finalText, { parse_mode: 'HTML' }).catch(() => {});
  await ctx.reply(renderDetectionSummary({
    results: detectionResults,
    elapsedSeconds: Math.ceil((Date.now() - startedAt) / 1000)
  }), { parse_mode: 'HTML' });
  if (ctx.message && ctx.message.message_id) {
    ctx.telegram.setMessageReaction(ctx.chat.id, ctx.message.message_id, [{ type: 'emoji', emoji: lastReaction }]).catch(() => {});
  }
}

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (!text) return;
  if (isOwner(ctx) && ctx.message.reply_to_message) {
    const targetId = await redis.get('contact:message:' + ctx.message.reply_to_message.message_id);
    if (targetId) {
      await bot.telegram.sendMessage(Number(targetId), '✦ <b>ʙᴀʟᴀsᴀɴ ᴀᴅᴍɪɴ</b>\n\n┃ ' + escapeHtml(text) + '\n\nᴋɪʀɪᴍ ᴘᴇsᴀɴ ʟᴀɢɪ ᴊɪᴋᴀ ɪɴɢɪɴ ᴍᴇᴍʙᴀʟᴀs.', { parse_mode: 'HTML' });
      return ctx.reply('✓ <b>ʙᴀʟᴀsᴀɴ ᴛᴇʀᴋɪʀɪᴍ ᴋᴇ ᴘᴇɴɢɢᴜɴᴀ</b>', { parse_mode: 'HTML' });
    }
  }
  if (text.startsWith('/')) return;
  if (await redis.get('contact:state:' + ctx.from.id)) {
    await redis.del('contact:state:' + ctx.from.id);
    if (!ADMIN_ID) return ctx.reply('✕ ᴀᴅᴍɪɴ ʙᴇʟᴜᴍ ᴅɪᴀᴛᴜʀ.');
    const sender = ctx.from.username ? '@' + ctx.from.username : (ctx.from.first_name || 'Pengguna');
    const forwarded = await bot.telegram.sendMessage(ADMIN_ID, '✉ <b>ᴘᴇsᴀɴ ᴍᴀsᴜᴋ</b>\n\nᴅᴀʀɪ ⦂ ' + escapeHtml(sender) + '\nɪᴅ ⦂ <code>' + ctx.from.id + '</code>\n\n┃ ' + escapeHtml(text) + '\n\n<i>Balas pesan ini untuk mengirim balasan langsung ke pengguna.</i>', { parse_mode: 'HTML' });
    await redis.set('contact:message:' + forwarded.message_id, String(ctx.from.id), { ex: 604800 });
    return ctx.reply('✓ <b>ᴘᴇsᴀɴ ᴛᴇʀᴋɪʀɪᴍ</b>\n\nᴘᴇsᴀɴ ᴀɴᴅᴀ ᴛᴇʟᴀʜ ᴅɪᴛᴇʀᴜsᴋᴀɴ ᴋᴇ ᴀᴅᴍɪɴ. ᴍᴏʜᴏɴ ᴛᴜɴɢɢᴜ ʙᴀʟᴀsᴀɴ ᴅɪ sɪɴɪ.', { parse_mode: 'HTML' });
  }
  if (text === '⌖ DETECT' || text === '⌖ Detect' || text === 'Detect') {
    return ctx.reply(
      '⌖ <b>ᴍᴏᴅᴇ ᴅᴇᴛᴇᴄᴛ sɪᴀᴘ</b> ⌖\n\nᴋɪʀɪᴍ ɴᴏᴍᴏʀ ᴡʜᴀᴛsᴀᴘᴘ ᴅᴇɴɢᴀɴ ᴋᴏᴅᴇ ɴᴇɢᴀʀᴀ\n\n\nᴄᴏɴᴛᴏʜ ⦂\n<code>6282298902274\n6281234567890</code>',
      { parse_mode: 'HTML' }
    );
  }
  if (text === '✧ BELI PREMIUM' || text === '✧ Beli Premium' || text === 'Beli Premium') {
    return showStore(ctx, false);
  }
  if (text === '/cancel' || text.toUpperCase() === 'BATAL') {
    if (isOwner(ctx)) await clearOwnerAction(ctx.from.id);
    return ctx.reply('✕ <b>ᴘʀᴏsᴇs ᴅɪʙᴀᴛᴀʟᴋᴀɴ</b>\n\nᴛɪᴅᴀᴋ ᴀᴅᴀ ᴘᴇʀᴜʙᴀʜᴀɴ ʏᴀɴɢ ᴅɪʟᴀᴋᴜᴋᴀɴ. ᴋᴀᴍᴜ ʙɪsᴀ ᴍᴇᴍɪʟɪʜ ᴍᴇɴᴜ ʟᴀɪɴ.');
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

  const numbers = text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\+?[\d\s().-]{7,20}$/.test(line) && (line.match(/\d/g) || []).length >= 7 && (line.match(/\d/g) || []).length <= 15);
  if (!numbers.length) return ctx.reply('⌁ <b>ᴘᴇʀɪɴᴛᴀʜ ᴛɪᴅᴀᴋ ᴅɪᴋᴇɴᴀʟɪ</b>\n\nᴋɪʀɪᴍ ɴᴏᴍᴏʀ ᴛᴀʀɢᴇᴛ ᴅᴇɴɢᴀɴ ᴋᴏᴅᴇ ɴᴇɢᴀʀᴀ\nᴜɴᴛᴜᴋ ᴍᴇᴍᴜʟᴀɪ ᴘᴇᴍᴇʀɪᴋsᴀᴀɴ.\n\nᴄᴏɴᴛᴏʜ ⦂ <code>6282298902274\n6282929929929</code>', { parse_mode: 'HTML' });
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
