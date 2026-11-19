function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>');
}

const VARIANT_PREFIX = {
  primary: '⚡ ',
  success: '✅ ',
  danger: '🛡 '
};

function btn(text, callback_data, variant = null) {
  const prefix = VARIANT_PREFIX[variant] || '';
  return { text: `${prefix}${text}`, callback_data };
}

function formatIDR(num) {
  return 'Rp ' + Number(num).toLocaleString('id-ID');
}

const THEMES = {
  obsidian: {
    id: 'obsidian',
    label: 'Obsidian Minimal',
    tagline: 'Clean monochrome & typographic precision',
    mark: '◈',
    bullet: '▪',
    divider: '──────────────────────────',
    barFill: '▰',
    barEmpty: '▱',
    usePreBlock: false
  },
  telemetry: {
    id: 'telemetry',
    label: 'Cyber Telemetry',
    tagline: 'Raw terminal HUD & monospace data grid',
    mark: '⬡',
    bullet: '▸',
    divider: '══════════════════════════',
    barFill: '█',
    barEmpty: '░',
    usePreBlock: true
  },
  editorial: {
    id: 'editorial',
    label: 'Editorial Gold',
    tagline: 'Refined spacing & executive layout',
    mark: '✦',
    bullet: '•',
    divider: '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄',
    barFill: '●',
    barEmpty: '○',
    usePreBlock: false
  },
  aurora: {
    id: 'aurora',
    label: 'Aurora Glass',
    tagline: 'Soft gradient framing & rounded card feel',
    mark: '✧',
    bullet: '◦',
    divider: '╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌',
    barFill: '◆',
    barEmpty: '◇',
    usePreBlock: false
  }
};

function getTheme(themeId) {
  return THEMES[themeId] || THEMES.obsidian;
}

function renderMeter(seconds, theme, length = 6) {
  if (!seconds || seconds <= 0) {
    return `${theme.barEmpty.repeat(length)} READY`;
  }
  const ratio = Math.min(1, Math.max(0.16, seconds / 7200));
  const filled = Math.round(ratio * length);
  const empty = Math.max(0, length - filled);
  return `${theme.barFill.repeat(filled)}${theme.barEmpty.repeat(empty)}`;
}

function formatSensitiveNumber(formattedNumber, privacyMode) {
  if (!privacyMode) return `<code>${escapeHtml(formattedNumber)}</code>`;
  const parts = formattedNumber.split(/[-\s]/);
  if (parts.length >= 3) {
    const visible = parts.slice(0, 2).join(' ');
    const hidden = parts.slice(2).join('-');
    return `<code>${escapeHtml(visible)}-</code><tg-spoiler><code>${escapeHtml(hidden)}</code></tg-spoiler>`;
  }
  return `<tg-spoiler><code>${escapeHtml(formattedNumber)}</code></tg-spoiler>`;
}

function formatDateWIB(unixSec) {
  const d = new Date(unixSec * 1000);
  return d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
}

// Note: Full original file is longer. This is a partial to get the project started. Please replace with full from your zip.
module.exports = {
  THEMES,
  getTheme,
  escapeHtml,
  btn,
  formatIDR,
  formatDateWIB
};
