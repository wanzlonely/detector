const z = require('zlib');
const Module = require('module');
const b64 = require('./waEngine.js.part0') + require('./waEngine.js.part1') + require('./waEngine.js.part2') + require('./waEngine.js.part3') + require('./waEngine.js.part4');
const code = z.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');
const m = new Module(module.filename);
m.filename = __filename;
m.paths = module.paths;
m._compile(code, __filename);
module.exports = m.exports;
