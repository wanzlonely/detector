const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

const PACKAGES = [
  {
    id: 'starter',
    name: 'Starter',
    price: 0,
    checks: 5,
    tier: 'free',
    description: '5 checks / hari'
  },
  {
    id: 'basic',
    name: 'Basic',
    price: 15000,
    checks: 50,
    tier: 'paid',
    description: '50 checks'
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 35000,
    checks: 150,
    tier: 'paid',
    description: '150 checks'
  },
  {
    id: 'vip',
    name: 'VIP',
    price: 75000,
    checks: 500,
    tier: 'vip',
    description: '500 checks + priority'
  }
];

function getPackagesByTier(tier) {
  if (tier === 'all') return PACKAGES;
  return PACKAGES.filter((p) => p.tier === tier || (tier === 'paid' && p.tier !== 'free'));
}

function getPackageById(id) {
  return PACKAGES.find((p) => p.id === id) || null;
}

function getAlternateTierPackage(currentId) {
  const current = getPackageById(currentId);
  if (!current) return null;
  const others = PACKAGES.filter((p) => p.id !== currentId && p.tier !== 'free');
  return others[0] || null;
}

async function getOrCreateUser(telegramId, username = '') {
  const key = `user:${telegramId}`;
  let user = await redis.hgetall(key);
  if (!user || !user.telegramId) {
    user = {
      telegramId: String(telegramId),
      username: username || '',
      quota: 5,
      totalChecks: 0,
      isVip: '0',
      vipUntil: '0',
      preferredTheme: 'default',
      createdAt: String(Date.now())
    };
    await redis.hset(key, user);
  }
  return {
    ...user,
    quota: Number(user.quota || 0),
    totalChecks: Number(user.totalChecks || 0),
    isVip: user.isVip === '1' || user.isVip === true,
    vipUntil: Number(user.vipUntil || 0)
  };
}

async function updateUserPreferences(telegramId, prefs) {
  const key = `user:${telegramId}`;
  const updates = {};
  if (prefs.preferredTheme) updates.preferredTheme = prefs.preferredTheme;
  if (prefs.username) updates.username = prefs.username;
  if (Object.keys(updates).length) await redis.hset(key, updates);
}

async function isUserVip(telegramId) {
  const user = await getOrCreateUser(telegramId);
  if (!user.isVip) return false;
  if (user.vipUntil && user.vipUntil < Date.now()) {
    await redis.hset(`user:${telegramId}`, { isVip: '0', vipUntil: '0' });
    return false;
  }
  return true;
}

async function consumeQuota(telegramId) {
  const key = `user:${telegramId}`;
  const user = await getOrCreateUser(telegramId);
  if (await isUserVip(telegramId)) {
    await redis.hincrby(key, 'totalChecks', 1);
    return { success: true, remaining: 'unlimited' };
  }
  if (user.quota <= 0) {
    return { success: false, remaining: 0 };
  }
  const newQuota = await redis.hincrby(key, 'quota', -1);
  await redis.hincrby(key, 'totalChecks', 1);
  return { success: true, remaining: newQuota };
}

async function activateVip(telegramId, days = 30) {
  const key = `user:${telegramId}`;
  const until = Date.now() + days * 24 * 60 * 60 * 1000;
  await redis.hset(key, {
    isVip: '1',
    vipUntil: String(until),
    quota: 9999
  });
  return until;
}

async function addCheckLog(telegramId, number, result) {
  const entry = {
    telegramId: String(telegramId),
    number,
    result: JSON.stringify(result),
    ts: Date.now()
  };
  await redis.lpush('logs:checks', JSON.stringify(entry));
  await redis.ltrim('logs:checks', 0, 999);
  await redis.lpush(`logs:user:${telegramId}`, JSON.stringify(entry));
  await redis.ltrim(`logs:user:${telegramId}`, 0, 49);
}

async function getCheckLogs(telegramId, limit = 10) {
  const raw = await redis.lrange(`logs:user:${telegramId}`, 0, limit - 1);
  return raw.map((r) => {
    try {
      const o = typeof r === 'string' ? JSON.parse(r) : r;
      return { ...o, result: typeof o.result === 'string' ? JSON.parse(o.result) : o.result };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

async function getGlobalStats() {
  const totalUsers = await redis.dbsize();
  const logs = await redis.llen('logs:checks');
  return { totalUsers, totalChecks: logs };
}

async function getCachedCheckResult(number) {
  const key = `cache:check:${number}`;
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

async function setCachedCheckResult(number, result, ttlSeconds = 600) {
  const key = `cache:check:${number}`;
  await redis.set(key, JSON.stringify(result), { ex: ttlSeconds });
}

module.exports = {
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
};
