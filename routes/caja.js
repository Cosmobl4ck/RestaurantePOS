const express = require('express');
const router = express.Router();
const Joi = require('joi');
const excel = require('exceljs');
const { supabase } = require('../config/supabase');
const { verificarSesion } = require('../middlewares/authMiddleware');
const authRole = require('../middlewares/authRole');
const { getBusinessDate } = require('../utils/business-time');

const allowedRoles = ['admin', 'gerente', 'cajero'];
const detallesSchema = Joi.object()
    .pattern(/^\d+(?:\.\d{1,2})?$/, Joi.number().integer().min(0).max(1000000))
    .max(30)
    .default({});
const aperturaSchema = Joi.object({
    turno: Joi.string().valid('1', '2').required(),
    monto_inicial: Joi.number().min(0).required(),
    detalles: detallesSchema
}).unknown(false);
const cierreSchema = Joi.object({
    caja_id: Joi.number().integer().positive().required(),
    monto_final: Joi.number().min(0).required(),
    detalles: detallesSchema
}).unknown(false);

function serializeDetalles(detalles) {
    const serialized = JSON.stringify(detalles || {});
    if (Buffer.byteLength(serialized, 'utf8') > 10000) throw new Error('CASH_DETAILS_TOO_LARGE');
    return serialized;
}

function cashErrorResponse(res, error, operation) {
    const message = String(error?.message || '');
    console.error(`Error al ${operation} caja:`, error);
    if (/CASH_ALREADY_OPEN/.test(message)) return res.status(409).json({ error: 'Ya existe una caja abierta.' });
    if (/CASH_ALREADY_CLOSED/.test(message)) return res.status(409).json({ error: 'La caja ya fue cerrada.' });
    if (/CASH_NOT_FOUND|CASH_RESTAURANT_NOT_FOUND/.test(message)) return res.status(404).json({ error: 'Caja no encontrada.' });
    if (/CASH_USER_NOT_AUTHORIZED/.test(message)) return res.status(403).json({ error: 'Usuario no autorizado para esta caja.' });
    if (/CASH_INVALID_|CASH_DETAILS_TOO_LARGE/.test(message)) return res.status(400).json({ error: 'Datos de caja inválidos.' });
    return res.status(500).json({ error: `No se pudo ${operation} la caja.` });
}

router.get('/', verificarSesion, authRole(allowedRoles), async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;
        const fecha = await getBusinessDate(supabase, restauranteId);
        const { data: cajaAbierta, error: errAbierta } = await supabase.from('cortes_caja').select('*')
            .eq('estado', 'abierta').eq('restaurante_id', restauranteId).maybeSingle();
        if (errAbierta) throw errAbierta;
        const { data: historial, error: errHistorial } = await supabase.from('cortes_caja').select('*')
            .eq('fecha', fecha).eq('restaurante_id', restauranteId).order('turno', { ascending: true });
        if (errHistorial) throw errHistorial;
        res.render('caja', { caja: cajaAbierta || null, historial: historial || [], usuario: req.session.usuario });
    } catch (error) {
        console.error('Error cargando caja:', error);
        res.status(500).send('Error en caja');
    }
});

router.post('/abrir', verificarSesion, authRole(allowedRoles), async (req, res) => {
    const restauranteId = req.session.usuario.restaurante_id;
    const usuarioId = req.session.usuario.id;
    const { value, error: validationError } = aperturaSchema.validate(req.body, { abortEarly: false, convert: true });
    if (validationError) return res.status(400).json({ error: 'Datos de apertura inválidos.' });
    try {
        const { data, error } = await supabase.rpc('pos_open_cash', {
            p_restaurante_id: Number(restauranteId), p_usuario_id: Number(usuarioId),
            p_turno: value.turno, p_monto_apertura: value.monto_inicial,
            p_detalles: serializeDetalles(value.detalles)
        });
        if (error) throw error;
        return res.status(201).json({ success: true, caja: data });
    } catch (error) {
        return cashErrorResponse(res, error, 'abrir');
    }
});

router.post('/cerrar', verificarSesion, authRole(allowedRoles), async (req, res) => {
    const restauranteId = req.session.usuario.restaurante_id;
    const usuarioId = req.session.usuario.id;
    const { value, error: validationError } = cierreSchema.validate(req.body, { abortEarly: false, convert: true });
    if (validationError) return res.status(400).json({ error: 'Datos de cierre inválidos.' });
    try {
        const { data, error } = await supabase.rpc('pos_close_cash', {
            p_restaurante_id: Number(restauranteId), p_caja_id: value.caja_id,
            p_usuario_id: Number(usuarioId), p_monto_cierre: value.monto_final,
            p_detalles: serializeDetalles(value.detalles)
        });
        if (error) throw error;
        return res.json({ success: true, ...data });
    } catch (error) {
        return cashErrorResponse(res, error, 'cerrar');
    }
});

router.get('/exportar/:id?', verificarSesion, authRole(allowedRoles), async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;
        const fecha = await getBusinessDate(supabase, restauranteId);
        const workbook = new excel.Workbook();
        const sheet = workbook.addWorksheet('Corte de Caja');
        let query = supabase.from('cortes_caja').select('*').eq('restaurante_id', restauranteId);
        if (req.params.id && req.params.id !== 'diario') query = query.eq('id', req.params.id);
        else query = query.eq('fecha', fecha);
        const { data: cortes, error } = await query;
        if (error) throw error;
        sheet.columns = [
            { header: 'Turno', key: 'turno', width: 10 }, { header: 'Estado', key: 'estado', width: 10 },
            { header: 'Inicial', key: 'inicial', width: 15 }, { header: '+ Ventas Efec.', key: 'ventas', width: 15 },
            { header: '= Esperado', key: 'esperado', width: 15 }, { header: 'Real (Contado)', key: 'final', width: 15 },
            { header: 'Diferencia', key: 'diferencia', width: 15 }
        ];
        (cortes || []).forEach((cash) => {
            const esperado = Number(cash.monto_apertura) + Number(cash.ventas_efectivo || 0);
            const row = sheet.addRow({
                turno: cash.turno || 'Único', estado: String(cash.estado).toUpperCase(), inicial: cash.monto_apertura,
                ventas: cash.ventas_efectivo || 0, esperado, final: cash.monto_cierre || 0,
                diferencia: cash.diferencia || 0
            });
            const cell = row.getCell('diferencia');
            if (Number(cash.diferencia) < 0) {
                cell.font = { color: { argb: 'FFFF0000' }, bold: true };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0E0' } };
            } else cell.font = { color: { argb: 'FF008000' }, bold: true };
        });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Corte_${req.params.id || 'Diario'}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error generando Excel de caja:', error);
        res.status(500).send('Error generando excel');
    }
});

module.exports = router;
