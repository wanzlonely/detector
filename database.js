const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

const PACKAGES = [
  { id: 'std_1d', tier: 'premium', tierLabel: 'PREMIUM', duration_days: 1, durationLabel: '1 Hari', price: 3000, tag: 'STARTER', bulk_limit: 30, highlight: 'Akses Premium penuh selama 24 jam.' },
  { id: 'std_3d', tier: 'premium', tierLabel: 'PREMIUM', duration_days: 3, durationLabel: '3 Hari', price: 5000, tag: 'HEMAT', bulk_limit: 30, highlight: 'Pilihan hemat untuk penggunaan beberapa hari.' },
  { id: 'std_7d', tier: 'premium', tierLabel: 'PREMIUM', duration_days: 7, durationLabel: '7 Hari', price: 10000, tag: 'POPULER', bulk_limit: 30, highlight: 'Pilihan populer untuk aktivitas mingguan.' },
  { id: 'std_15d', tier: 'premium', tierLabel: 'PREMIUM', duration_days: 15, durationLabel: '15 Hari', price: 13000, tag: 'PRO VALUE', bulk_limit: 30, highlight: 'Lebih hemat untuk penggunaan jangka menengah.' },
  { id: 'std_20d', tier: 'premium', tierLabel: 'PREMIUM', duration_days: 20, durationLabel: '20 Hari', price: 25000, tag: 'LONG PASS', bulk_limit: 30, highlight: 'Akses Premium untuk durasi lebih panjang.' }
];

function getTodayWIB() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().split('T')[0];
}

function getPackagesByTier() {
  return PACKAGES.slice();
}

function getPackageById(pkgId) {
  return PACKAGES.find((p) => p.id === pkgId) || null;
}

function getAlternateTierPackage(pkg) {
  if (!pkg) return null;
  const targetTier = pkg.tier === 'ultra' ? 'standard' : 'ultra';
  return PACKAGES.find((p) => p.tier === targetTier && p.duration_days === pkg.duration_days) || null;
}

async function getOrCreateUser(tgUser) {
  const key = `user:${tgUser.id}`;
  const today = getTodayWIB();
  let user = await redis.get(key);

  if (!user) {
    const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || 'User';
    user = {
      telegram_id: tgUser.id,
      username: tgUser.username || '-',
      full_name: fullName,
      theme: 'obsidian',
      privacy_mode: 0,
      vip_until: 0,
      vip_tier: 'FREE',
      vip_plan: 'FREE',
      bulk_limit: 1,
      total_checks: 0,
      created_at: Math.floor(Date.now() / 1000)
    };
    await redis.set(key, user);
    await redis.sadd('users:all', String(tgUser.id));
  } else {
    const updatedName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || user.full_name;
    const updatedUsername = tgUser.username || user.username;
    let changed = false;

    if (updatedName !== user.full_name) {
      user.full_name = updatedName;
      changed = true;
    }
    if (updatedUsername !== user.username) {
      user.username = updatedUsername;
      changed = true;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (user.vip_until > 0 && user.vip_until < nowSec) {
      user.vip_until = 0;
      user.vip_tier = 'FREE';
      user.vip_plan = 'FREE';
      user.bulk_limit = 1;
      changed = true;
    }

    if (changed) {
      await redis.set(key, user);
    }
  }

  const usedToday = Number((await redis.get(`quota:${tgUser.id}:${today}`)) || 0);
  return {
    ...user,
    free_used_today: usedToday
  };
}

async function updateUserPreferences(telegramId, updates) {
  const key = `user:${telegramId}`;
  const user = await redis.get(key);
  if (!user) return null;
  const merged = { ...user, ...updates };
  await redis.set(key, merged);
  return merged;
}

function isUserVip(user) {
  return Number(user.vip_until || 0) > Math.floor(Date.now() / 1000);
}

async function consumeQuota(telegramId, count = 1) {
  const userKey = `user:${telegramId}`;
  const user = await redis.get(userKey);
  if (!user) return false;

  if (isUserVip(user)) {
    user.total_checks = Number(user.total_checks || 0) + count;
    await redis.set(userKey, user);
    await redis.incrby('stats:total_checks', count);
    await redis.zadd('leaderboard:checks', { score: Number(user.total_checks || 0), member: String(telegramId) });
    return true;
  }

  const today = getTodayWIB();
  const quotaKey = `quota:${telegramId}:${today}`;
  const used = Number((await redis.get(quotaKey)) || 0);
  const bonusKey = 'referral:bonus_quota:' + telegramId;
  const bonus = Number(await redis.get(bonusKey) || 0);
  if (bonus >= count) {
    await redis.incrby(bonusKey, -count);
    user.total_checks = Number(user.total_checks || 0) + count;
    await redis.set(userKey, user);
    await redis.incrby('stats:total_checks', count);
    await redis.zadd('leaderboard:checks', { score: Number(user.total_checks || 0), member: String(telegramId) });
    return true;
  }
  if (bonus > 0 && used + (count - bonus) <= 3) {
    await redis.incrby(bonusKey, -bonus);
    await redis.incrby(quotaKey, count - bonus);
    await redis.expire(quotaKey, 90000);
    user.total_checks = Number(user.total_checks || 0) + count;
    await redis.set(userKey, user);
    await redis.incrby('stats:total_checks', count);
    await redis.zadd('leaderboard:checks', { score: Number(user.total_checks || 0), member: String(telegramId) });
    return true;
  }
  if (used + count <= 3) {
    await redis.incrby(quotaKey, count);
    await redis.expire(quotaKey, 90000);
    user.total_checks = Number(user.total_checks || 0) + count;
    await redis.set(userKey, user);
    await redis.incrby('stats:total_checks', count);
    await redis.zadd('leaderboard:checks', { score: Number(user.total_checks || 0), member: String(telegramId) });
    return true;
  }

  return false;
}

async function activateVip(telegramId, days, tier = 'STANDARD', planName = null) {
  const userKey = `user:${telegramId}`;
  let user = await redis.get(userKey);
  if (!user) {
    user = {
      telegram_id: telegramId,
      username: '-',
      full_name: 'VIP User',
      theme: 'obsidian',
      privacy_mode: 0,
      vip_until: 0,
      vip_tier: 'FREE',
      vip_plan: 'FREE',
      bulk_limit: 1,
      total_checks: 0,
      created_at: Math.floor(Date.now() / 1000)
    };
    await redis.sadd('users:all', String(telegramId));
  }

  const normalizedTier = 'PREMIUM';
  const nowSec = Math.floor(Date.now() / 1000);
  const base = Number(user.vip_until || 0) > nowSec ? Number(user.vip_until) : nowSec;
  const expiry = base + Number(days) * 86400;

  user.vip_until = expiry;
  user.vip_tier = normalizedTier;
  user.vip_plan = planName || `${normalizedTier} · ${days} Hari`;
  user.bulk_limit = 30;

  await redis.set(userKey, user);
  await redis.sadd('users:vip', String(telegramId));
  return { expiry, user };
}

async function addCheckLog(telegramId, phoneNumber, statusSummary, proxyNode) {
  const logKey = `logs:${telegramId}`;
  const entry = {
    phone_number: phoneNumber,
    status_summary: statusSummary,
    proxy_node: proxyNode || 'ROTATING',
    checked_at: Math.floor(Date.now() / 1000)
  };
  await redis.lpush(logKey, entry);
  await redis.ltrim(logKey, 0, 14);
}

async function getCheckLogs(telegramId, limit = 10) {
  const items = await redis.lrange(`logs:${telegramId}`, 0, limit - 1);
  return (items || []).map((item) => (typeof item === 'string' ? JSON.parse(item) : item));
}

const CHECK_CACHE_TTL_SECONDS = Number(process.env.CHECK_CACHE_TTL_SECONDS || 120);

function normalizePhoneForCache(rawNumber) {
  return String(rawNumber).replace(/\D/g, '');
}

async function getCachedCheckResult(rawNumber) {
  if (CHECK_CACHE_TTL_SECONDS <= 0) return null;
  const key = `checkcache:${normalizePhoneForCache(rawNumber)}`;
  const cached = await redis.get(key);
  return cached || null;
}

async function setCachedCheckResult(rawNumber, result) {
  if (CHECK_CACHE_TTL_SECONDS <= 0) return;
  if (!result || result.error || result.softFallback || result.needsRecheck) return;
  // Never persist cooldown / banned — status changes quickly on recheck
  if (result.anyCooldown || result.accountStatus === 'IN_COOLDOWN' || result.isBanned) return;
  if (result.accountStatus === 'UNKNOWN') return;

  const key = `checkcache:${normalizePhoneForCache(rawNumber)}`;
  const ttl = Math.min(CHECK_CACHE_TTL_SECONDS, 90);
  await redis.set(key, result, { ex: ttl });
}

async function clearCachedCheckResult(rawNumber) {
  const key = `checkcache:${normalizePhoneForCache(rawNumber)}`;
  await redis.del(key);
}

async function getGlobalStats() {
  const allUserIds = await redis.smembers('users:all');
  const vipIds = await redis.smembers('users:vip');
  const nowSec = Math.floor(Date.now() / 1000);
  let activeVipCount = 0;

  for (const uid of vipIds || []) {
    const u = await redis.get(`user:${uid}`);
    if (u && Number(u.vip_until || 0) > nowSec) {
      activeVipCount += 1;
    } else {
      await redis.srem('users:vip', String(uid));
    }
  }

  const totalChecks = Number((await redis.get('stats:total_checks')) || 0);

  return {
    totalUsers: (allUserIds || []).length,
    activeVip: activeVipCount,
    totalChecks,
    allUserIds: allUserIds || []
  };
}

async function registerReferral(inviteeId, inviterId) {
  const invitee = String(inviteeId);
  const inviter = String(inviterId || '').replace(/^ref_/, '');
  if (!/^\d+$/.test(inviter) || inviter === invitee) return false;
  const inviterUser = await redis.get('user:' + inviter);
  if (!inviterUser) return false;
  const already = await redis.get('referral:invited_by:' + invitee);
  if (already) return false;
  const saved = await redis.set('referral:invited_by:' + invitee, inviter, { nx: true });
  if (!saved) return false;
  await redis.sadd('referrals:' + inviter, invitee);
  return true;
}

async function qualifyReferral(inviteeId) {
  const invitee = String(inviteeId);
  const inviter = await redis.get('referral:invited_by:' + invitee);
  if (!inviter || await redis.get('referral:rewarded:' + invitee)) return { rewarded: false };
  const completed = Number(await redis.incr('referral:completed:' + invitee));
  if (completed < 3) return { rewarded: false, completed };
  const claimed = await redis.set('referral:rewarded:' + invitee, '1', { nx: true });
  if (!claimed) return { rewarded: false, completed };
  await redis.incrby('referral:coins:' + inviter, 5);
  await redis.incr('referral:rewards:' + inviter);
  return { rewarded: true, inviter: Number(inviter), coins: 5 };
}

async function getReferralCoinBalance(id) {
  return Number(await redis.get('referral:coins:' + id) || 0);
}

async function redeemReferralReward(id, offer) {
  const key = 'referral:coins:' + id;
  const balance = await getReferralCoinBalance(id);
  if (balance < offer.cost) return { ok: false, balance };
  const after = Number(await redis.incrby(key, -offer.cost));
  if (after < 0) {
    await redis.incrby(key, offer.cost);
    return { ok: false, balance: await getReferralCoinBalance(id) };
  }
  if (offer.type === 'quota') await redis.incrby('referral:bonus_quota:' + id, offer.amount);
  else await activateVip(id, offer.amount, 'PREMIUM', 'PREMIUM · ' + offer.amount + ' Hari');
  return { ok: true, balance: after };
}

async function getReferralStats(telegramId) {
  const id = String(telegramId);
  const invitees = await redis.smembers('referrals:' + id);
  const rewarded = Number(await redis.get('referral:rewards:' + id) || 0);
  const coins = await getReferralCoinBalance(id);
  return { total: (invitees || []).length, rewarded, coins };
}

async function getLeaderboard(limit = 10) {
  const migrationKey = 'leaderboard:migrated:v1';
  const migrated = await redis.get(migrationKey);
  if (!migrated) {
    const all = await redis.smembers('users:all');
    for (const id of all || []) {
      const user = await redis.get('user:' + id);
      if (!user) continue;
      const score = Number(user.total_checks || 0);
      if (score > 0) await redis.zadd('leaderboard:checks', { score, member: String(id) });
    }
    await redis.set(migrationKey, '1');
  }
  const ids = await redis.zrange('leaderboard:checks', 0, Math.max(0, limit - 1), { rev: true });
  const rows = [];
  for (const id of ids || []) {
    const user = await redis.get('user:' + id);
    if (user) rows.push({ telegram_id: String(id), full_name: user.full_name || 'Pengguna', username: user.username || '-', total_checks: Number(user.total_checks || 0) });
  }
  return rows;
}

async function incrementUserChecks(telegramId, count = 1) {
  const key = `user:${telegramId}`;
  const user = await redis.get(key);
  if (!user) return false;
  user.total_checks = Number(user.total_checks || 0) + Number(count || 0);
  await redis.set(key, user);
  await redis.incrby('stats:total_checks', Number(count || 0));
  await redis.zadd('leaderboard:checks', { score: Number(user.total_checks || 0), member: String(telegramId) });
  return true;
}

module.exports = {
  redis,
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
  setCachedCheckResult,
  clearCachedCheckResult,
  incrementUserChecks,
  registerReferral,
  qualifyReferral,
  getReferralStats,
  redeemReferralReward,
  getLeaderboard
};
