const express = require('express');
const router = express.Router();
const { verificarSesion } = require('../middlewares/authMiddleware');

// Compatibilidad de URL: el único KDS oficial vive en /kds.
router.get('/', verificarSesion, (req, res) => res.redirect('/kds/cocina'));

router.all('*', verificarSesion, (req, res) => {
    res.status(410).json({
        error: 'KDS legado retirado. Usa /kds/cocina y su API autenticada.'
    });
});

module.exports = router;
