require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { findPhoneNumbersInText } = require('libphonenumber-js');
const {
  redis, getPackagesByTier, getPackageById, getOrCreateUser, isUserVip,
  consumeQuota, addCheckLog, getGlobalStats, incrementUserChecks, activateVip, registerReferral, qualifyReferral, getReferralStats, getLeaderboard, redeemReferralReward
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

// CRITICAL: premium batch always 30
async function processNumbers_STUB() {}

module.exports = bot;
console.log('BOT PARTIAL - NEED FULL RESTORE');
