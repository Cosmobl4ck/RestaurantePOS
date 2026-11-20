const multer = require('multer');

function hasXlsxSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  const signature = buffer.subarray(0, 4).toString('hex');
  return ['504b0304', '504b0506', '504b0708'].includes(signature);
}

const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const PNG_IEND = Buffer.from('49454e44ae426082', 'hex');

function detectedImageType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    // Un PNG valido siempre cierra con el chunk IEND. Exigirlo (cuando el
    // archivo es lo bastante grande) descarta "polyglots" que solo imitan la
    // cabecera y luego llevan otro contenido.
    if (buffer.length >= 16 && !buffer.subarray(-8).equals(PNG_IEND)) return null;
    return 'png';
  }
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
