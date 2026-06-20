const path = require('path');
const { ocrImage } = require('./ocr-node');
const img = process.argv[2];
ocrImage(img, {
  onProgress: m => process.stderr.write('[' + m + ']\n'),
  langPath: path.join(__dirname, 'ocr', 'tessdata'),
  gzip: false,
  cachePath: '/tmp/tscache',
})
  .then(r => console.log('RESULT ' + JSON.stringify(r)))
  .catch(e => { console.error('ERR ' + (e && e.stack ? e.stack : e)); process.exit(1); });
