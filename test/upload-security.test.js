const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { hasXlsxSignature, detectedImageType } = require('../utils/upload-security');

test('upload signatures distinguish XLSX, PNG, JPEG and spoofed text', () => {
  assert.equal(hasXlsxSignature(Buffer.from('504b0304', 'hex')), true);
  assert.equal(hasXlsxSignature(Buffer.from('not an xlsx')), false);
  assert.equal(detectedImageType(Buffer.from('89504e470d0a1a0a', 'hex')), 'png');
  assert.equal(detectedImageType(Buffer.from('ffd8ff', 'hex')), 'jpeg');
  assert.equal(detectedImageType(Buffer.from('not an image')), null);
});

test('active upload routes use bounded middleware and content signatures', () => {
  const products = fs.readFileSync('routes/productos.js', 'utf8');
  const config = fs.readFileSync('routes/configuracion.js', 'utf8');
  assert.match(products, /fileSize: 5 \* 1024 \* 1024/);
  assert.match(products, /hasXlsxSignature\(req\.file\.buffer\)/);
  assert.match(config, /fileSize: 3 \* 1024 \* 1024/);
  assert.match(config, /detectedImageType\(req\.files\.logo\[0\]\.buffer\)/);
  assert.match(products, /uploadErrorMiddleware/);
  assert.match(config, /uploadErrorMiddleware/);
});
