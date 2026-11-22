const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const multer = require('multer');
const { detectedImageType, uploadErrorMiddleware } = require('../utils/upload-security');
const { hasFeatureSync } = require('../services/planService');
const { registrarAuditoria } = require('../services/auditService');

// IMPORTAR AL GUARDIA DE SEGURIDAD
const { verificarSesion } = require('../middlewares/authMiddleware');

// Configuración de multer para memoria
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024, files: 2, fields: 30, fieldSize: 256 * 1024, fieldArrayIndexLimit: 100 },
    fileFilter: function (req, file, cb) {
        const extOk = /\.(jpg|jpeg|png)$/i.test(file.originalname || '');
        const mimeOk = ['image/jpeg','image/png'].includes(file.mimetype);
        if (!extOk || !mimeOk) return cb(new Error('Solo se permiten imágenes JPG/PNG'));
        cb(null, true);
    }
});

// Postgres/PostgREST representa columnas BYTEA como texto hex "\x89504e47...".
// Estos helpers convierten entre ese formato y un Buffer de Node.
const bufferABytea = (buffer) => '\\x' + buffer.toString('hex');
const byteaABase64 = (bytea) => {
    if (!bytea) return null;
    const hex = bytea.startsWith('\\x') ? bytea.slice(2) : bytea;
    return Buffer.from(hex, 'hex').toString('base64');
};

// ==========================================
// 1. GET / - OBTENER CONFIGURACIÓN DEL LOCAL
// ==========================================
router.get('/', verificarSesion, async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;
        const puedeMarca = typeof res.locals.planPuede === 'function'
            ? res.locals.planPuede('configuracion.marca')
            : hasFeatureSync(req.session.usuario.plan, 'configuracion.marca');

        const { data: negocioConfig } = await supabase
            .from('restaurantes')
            .select('propina_porcentaje')
            .eq('id', restauranteId)
            .maybeSingle();
        const propinaPorcentaje = Number(negocioConfig?.propina_porcentaje || 0);

        // Buscamos la configuración específica de ESTE restaurante
        const { data: config, error } = await supabase
            .from('configuracion_impresion')
            .select('*')
            .eq('restaurante_id', restauranteId)
            .maybeSingle();

        if (error) throw error;

        if (!config) {
            // Si no hay configuración para este restaurante, mandamos valores vacíos
            return res.render('configuracion', {
                config: {
                    nombre_negocio: '',
                    direccion: '',
                    telefono: '',
                    nit: '',
                    pie_pagina: '',
                    ancho_papel: 80,
                    font_size: 1,
                    logo_src: null,
                    qr_src: null
                },
                puedeMarca,
                propinaPorcentaje,
                usuario: req.session.usuario
            });
        }

        // Convertimos las imágenes binarias a data URI para poder previsualizarlas,
        // y las quitamos del objeto para no saturar la vista con el binario crudo.
        const logoBase64 = byteaABase64(config.logo_data);
        const qrBase64 = byteaABase64(config.qr_data);

        const configParaVista = { ...config };
        delete configParaVista.logo_data;
        delete configParaVista.qr_data;
        configParaVista.logo_src = logoBase64 ? `data:image/${config.logo_tipo};base64,${logoBase64}` : null;
        configParaVista.qr_src = qrBase64 ? `data:image/${config.qr_tipo};base64,${qrBase64}` : null;
        if (!puedeMarca) {
            configParaVista.logo_src = null;
            configParaVista.qr_src = null;
            configParaVista.pie_pagina = null;
            configParaVista.ancho_papel = 80;
            configParaVista.font_size = 1;
        }

        res.render('configuracion', {
            config: configParaVista,
            puedeMarca,
            propinaPorcentaje,
            usuario: req.session.usuario
        });
    } catch (error) {
        console.error('Error al obtener configuración:', error);
        res.status(500).json({ error: 'Error al obtener configuración' });
    }
});

// ==========================================
// 2. POST / - GUARDAR O ACTUALIZAR
// ==========================================
router.post('/', verificarSesion, uploadErrorMiddleware(upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'qr', maxCount: 1 }
])), async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;
        const puedeMarca = typeof res.locals.planPuede === 'function'
            ? res.locals.planPuede('configuracion.marca')
            : hasFeatureSync(req.session.usuario.plan, 'configuracion.marca');
        const {
            nombre_negocio,
            direccion,
            telefono,
            nit,
            pie_pagina,
            ancho_papel,
            font_size
        } = req.body;

        const nombreLimpio = String(nombre_negocio || '').trim();
        if (nombreLimpio.length < 2 || nombreLimpio.length > 100) {
            return res.status(400).json({ error: 'El nombre del negocio debe tener entre 2 y 100 caracteres.' });
        }

        const registro = {
            restaurante_id: restauranteId,
            nombre_negocio: nombreLimpio,
            direccion: String(direccion || '').trim().slice(0, 200) || null,
            telefono: String(telefono || '').trim().slice(0, 30) || null,
            nit: String(nit || '').trim().slice(0, 30) || null,
            updated_at: new Date().toISOString()
        };

        // El branding previo no se borra al bajar de plan: solo se ignora al
        // guardar y se oculta al mostrar/imprimir. Si vuelve a Premium, reaparece.
        if (puedeMarca) {
            registro.pie_pagina = String(pie_pagina || '').trim().slice(0, 200) || null;
            registro.ancho_papel = Number(ancho_papel) === 58 ? 58 : 80;
            registro.font_size = Number(font_size) === 2 ? 2 : 1;

            if (req.files?.logo) {
                const logoType = detectedImageType(req.files.logo[0].buffer);
                if (!logoType) return res.status(400).json({ error: 'La imagen de logo no es valida.' });
                registro.logo_data = bufferABytea(req.files.logo[0].buffer);
                registro.logo_tipo = logoType;
            }
            if (req.files?.qr) {
                const qrType = detectedImageType(req.files.qr[0].buffer);
                if (!qrType) return res.status(400).json({ error: 'La imagen QR no es valida.' });
                registro.qr_data = bufferABytea(req.files.qr[0].buffer);
                registro.qr_tipo = qrType;
            }
        }

        // restaurante_id es UNIQUE en esta tabla, así que upsert crea o actualiza en un solo paso
        // y evita pisar la configuración de otro restaurante.
        const { error } = await supabase
            .from('configuracion_impresion')
            .upsert(registro, { onConflict: 'restaurante_id' });

        if (error) throw error;

        await registrarAuditoria(req, {
            accion: 'configuracion.actualizar',
            entidad: 'configuracion',
            detalle: {
                nombre_negocio: registro.nombre_negocio,
                direccion: Boolean(registro.direccion),
                telefono: Boolean(registro.telefono),
                nit: Boolean(registro.nit),
                marca: puedeMarca,
                logo: Boolean(req.files?.logo),
                qr: Boolean(req.files?.qr),
                ancho_papel: registro.ancho_papel,
                font_size: registro.font_size
            }
        });

        res.redirect('/configuracion');
    } catch (error) {
        console.error('Error en el procesamiento de config:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Propina obligatoria por ticket: solo Admin/Gerente.
router.post('/propina', verificarSesion, async (req, res) => {
    const usuario = req.session.usuario;
    if (!['admin', 'gerente'].includes(usuario.rol)) {
        return res.status(403).json({ error: 'Solo administradores o gerentes pueden configurar la propina.' });
    }
    const porcentaje = Number(req.body.propina_porcentaje);
    if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
        return res.status(400).json({ error: 'La propina debe estar entre 0 y 100.' });
    }
    try {
        const { error } = await supabase
            .from('restaurantes')
            .update({ propina_porcentaje: Math.round(porcentaje * 100) / 100 })
            .eq('id', usuario.restaurante_id);
        if (error) throw error;
        await registrarAuditoria(req, {
            accion: 'configuracion.propina',
            entidad: 'restaurante',
            entidadId: usuario.restaurante_id,
            detalle: { propina_porcentaje: porcentaje }
        });
        res.redirect('/configuracion');
    } catch (error) {
        console.error('Error guardando propina:', error.message);
        res.status(500).json({ error: 'No se pudo guardar la propina.' });
    }
});

module.exports = router;
