const z = require('zlib');
const Module = require('module');
const b64 = require('./waEngine.js.part0') + require('./waEngine.js.part1') + require('./waEngine.js.part2') + require('./waEngine.js.part3') + require('./waEngine.js.part4') + require('./waEngine.js.part5') + require('./waEngine.js.part6') + require('./waEngine.js.part7') + require('./waEngine.js.part8') + require('./waEngine.js.part9') + require('./waEngine.js.part10') + require('./waEngine.js.part11') + require('./waEngine.js.part12') + require('./waEngine.js.part13') + require('./waEngine.js.part14') + require('./waEngine.js.part15');
const code = z.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');
const m = new Module(module.filename);
m.filename = __filename;
m.paths = module.paths;
m._compile(code, __filename);
module.exports = m.exports;
