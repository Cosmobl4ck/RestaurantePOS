const multer = require('multer');

function hasXlsxSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  const signature = buffer.subarray(0, 4).toString('hex');
  return ['504b0304', '504b0506', '504b0708'].includes(signature);
}

function detectedImageType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  return null;
}

function uploadErrorMiddleware(uploadMiddleware) {
  return (req, res, next) => uploadMiddleware(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'El archivo supera el limite permitido.' });
    }
    return res.status(400).json({ error: 'Archivo no permitido.' });
  });
}

module.exports = { hasXlsxSignature, detectedImageType, uploadErrorMiddleware };
