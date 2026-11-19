const z = require('zlib');
const Module = require('module');
const code = z.gunzipSync(Buffer.from('PLACEHOLDER_B64_BOT', 'base64')).toString('utf8');
const m = new Module(module.filename);
m.filename = __filename;
m.paths = module.paths;
m._compile(code, __filename);
module.exports = m.exports;
