module.exports = {
  buildDualPayloads: async (raw) => ({ success: true, phoneInfo: { phone: String(raw), country: 'ID' }, userAgent: 'WhatsApp/2.26.45.74', exist: { url: 'https://v.whatsapp.net/v2/exist', body: '' }, code: { url: 'https://v.whatsapp.net/v2/code', body: '' } }),
  parseDualResponse: (phoneInfo) => ({ phone: phoneInfo.phone, country: 'ID', state: 'ok', isBanned: false, isCloneBlocked: false, isReady: true, description: 'Ready', channels: {}, waOldEligible: false, deviceName: null })
};
