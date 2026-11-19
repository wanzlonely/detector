function escapeHtml(str = '') { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function formatIDR(num) { return 'Rp ' + Number(num).toLocaleString('id-ID'); }
function formatDateWIB(unixSec) { if (!unixSec) return '-'; return new Date(unixSec * 1000).toLocaleString('id-ID', {timeZone:'Asia/Jakarta'}) + ' WIB'; }
function renderDashboard() { return '✦ META DETECT ✦'; }
function renderStatus() { return 'STATUS'; }
function renderLeaderboard() { return 'LEADERBOARD'; }
function renderReferral() { return 'REFERRAL'; }
function renderReferralExchange() { return 'EXCHANGE'; }
function renderStoreCatalog() { return 'STORE'; }
function renderPackageDetailCard() { return 'PACKAGE'; }
function renderPaymentMaintenanceCard() { return 'PAYMENT'; }
function renderCooldownCard() { return 'COOLDOWN'; }
function renderDetectionSummary({results, elapsedSeconds}) { return 'HASIL DETEKSI\nproses ⟿ ' + (elapsedSeconds||0) + 'd'; }
module.exports = { escapeHtml, formatIDR, formatDateWIB, renderDashboard, renderStatus, renderLeaderboard, renderReferral, renderReferralExchange, renderStoreCatalog, renderPackageDetailCard, renderPaymentMaintenanceCard, renderCooldownCard, renderDetectionSummary };
