const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

const PACKAGES = [
  {
    id: 'std_1d',
    tier: 'standard',
    tierLabel: 'PREMIUM STANDARD',
    duration_days: 1,
    durationLabel: '1 Hari',
    price: 3000,
    tag: 'STARTER',
    bulk_limit: 10,
    highlight: 'Akses penuh 24 jam tanpa batas kuota harian.'
  },
  {
    id: 'std_3d',
    tier: 'standard',
    tierLabel: 'PREMIUM STANDARD',
    duration_days: 3,
    durationLabel: '3 Hari',
    price: 5000,
    tag: 'HEMAT',
    bulk_limit: 10,
    highlight: 'Pilihan ekonomis untuk kebutuhan pengecekan 3 hari.'
  },
  {
    id: 'std_7d',
    tier: 'standard',
    tierLabel: 'PREMIUM STANDARD',
    duration_days: 7,
    durationLabel: '7 Hari',
    price: 10000,
    tag: 'POPULER',
    bulk_limit: 10,
    highlight: 'Paling diminati untuk operasional mingguan.'
  },
  {
    id: 'std_15d',
    tier: 'standard',
    tierLabel: 'PREMIUM STANDARD',
    duration_days: 15,
    durationLabel: '15 Hari',
    price: 13000,
    tag: 'PRO VALUE',
    bulk_limit: 10,
    highlight: 'Efisiensi biaya harian super rendah selama 15 hari.'
  },
  {
    id: 'std_20d',
    tier: 'standard',
    tierLabel: 'PREMIUM STANDARD',
    duration_days: 20,
    durationLabel: '20 Hari',
    price: 25000,
    tag: 'LONG PASS',
    bulk_limit: 10,
    highlight: 'Durasi maksimal Standard dengan stabilitas penuh.'
  },
  {
    id: 'ult_1d',
    tier: 'ultra',
    tierLabel: 'PREMIUM ULTRA',
    duration_days: 1,
    durationLabel: '1 Hari',
    price: 6000,
    tag: 'ULTRA TRIAL',
    bulk_limit: 30,
    highlight: 'Performa puncak Ultra & Bulk 30 nomor selama 24 jam.'
  },
  {
    id: 'ult_3d',
    tier: 'ultra',
    tierLabel: 'PREMIUM ULTRA',
    duration_days: 3,
    durationLabel: '3 Hari',
    price: 10000,
    tag: 'ULTRA HEMAT',
    bulk_limit: 30,
    highlight: 'Kecepatan node prioritas & batch analytics 3 hari.'
  },
  {
    id: 'ult_7d',
    tier: 'ultra',
    tierLabel: 'PREMIUM ULTRA',
    duration_days: 7,
    durationLabel: '7 Hari',
    price: 18000,
    tag: 'BEST SELLER',
    bulk_limit: 30,
    highlight: 'Keseimbangan terbaik kapasitas Ultra untuk 1 minggu.'
  },
  {
    id: 'ult_15d',
    tier: 'ultra',
    tierLabel: 'PREMIUM ULTRA',
    duration_days: 15,
    durationLabel: '15 Hari',
    price: 25000,
    tag: 'ULTRA PRO',
    bulk_limit: 30,
    highlight: 'Kapasitas tinggi tanpa antrean selama 15 hari penuh.'
  },
  {
    id: 'ult_20d',
    tier: 'ultra',
    tierLabel: 'PREMIUM ULTRA',
    duration_days: 20,
    durationLabel: '20 Hari',
    price: 45000,
    tag: 'APEX TIER',
    bulk_limit: 30,
    highlight: 'Kasta tertinggi dengan limit batch & rotasi IP maksimal.'
  }
];

function getTodayWIB() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().split('T')[0];
}

function getPackagesByTier(tier) {
  return PACKAGES.filter((p) => p.tier === String(tier).toLowerCase());
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
    return true;
  }

  const today = getTodayWIB();
  const quotaKey = `quota:${telegramId}:${today}`;
  const used = Number((await redis.get(quotaKey)) || 0);

  if (used + count <= 3) {
    await redis.incrby(quotaKey, count);
    await redis.expire(quotaKey, 90000);
    user.total_checks = Number(user.total_checks || 0) + count;
    await redis.set(userKey, user);
    await redis.incrby('stats:total_checks', count);
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

  const normalizedTier = String(tier).toUpperCase() === 'ULTRA' ? 'ULTRA' : 'STANDARD';
  const nowSec = Math.floor(Date.now() / 1000);
  const base = Number(user.vip_until || 0) > nowSec ? Number(user.vip_until) : nowSec;
  const expiry = base + Number(days) * 86400;

  user.vip_until = expiry;
  user.vip_tier = normalizedTier;
  user.vip_plan = planName || `${normalizedTier} · ${days} Hari`;
  user.bulk_limit = normalizedTier === 'ULTRA' ? 30 : 10;

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

const CHECK_CACHE_TTL_SECONDS = Number(process.env.CHECK_CACHE_TTL_SECONDS || 600);

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
  const key = `checkcache:${normalizePhoneForCache(rawNumber)}`;
  await redis.set(key, result, { ex: CHECK_CACHE_TTL_SECONDS });
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
  incrementUserChecks
};

async function incrementUserChecks(telegramId, count = 1) {
  const key = `user:${telegramId}`;
  const user = await redis.get(key);
  if (!user) return false;
  user.total_checks = Number(user.total_checks || 0) + Number(count || 0);
  await redis.set(key, user);
  await redis.incrby('stats:total_checks', Number(count || 0));
  return true;
}
