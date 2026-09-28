const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const excel = require('exceljs');

// IMPORTAR AL GUARDIA DE SEGURIDAD
const { verificarSesion } = require('../middlewares/authMiddleware');
const authRole = require('../middlewares/authRole'); // Importar el middleware de roles

const hoyISO = () => new Date().toISOString().split('T')[0];

// =======================================================
// VISTA PRINCIPAL (Cortes de Caja)
// =======================================================
router.get('/', verificarSesion, authRole(['admin', 'gerente', 'cajero']), async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;
        const fecha = hoyISO();

        // Buscar si hay una caja abierta HOY PARA ESTE RESTAURANTE
        const { data: cajaAbierta, error: errAbierta } = await supabase
            .from('cortes_caja')
            .select('*')
            .eq('fecha', fecha)
            .eq('estado', 'abierta')
            .eq('restaurante_id', restauranteId)
            .maybeSingle();

        if (errAbierta) throw errAbierta;

        // Historial del día PARA ESTE RESTAURANTE
        const { data: historial, error: errHistorial } = await supabase
            .from('cortes_caja')
            .select('*')
            .eq('fecha', fecha)
            .eq('restaurante_id', restauranteId)
            .order('turno', { ascending: true });

        if (errHistorial) throw errHistorial;

        res.render('caja', {
            caja: cajaAbierta || null,
            historial: historial || [],
            usuario: req.session.usuario
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error en caja');
    }
});

// =======================================================
// ABRIR CAJA (TURNO 1 o 2)
// =======================================================
router.post('/abrir', verificarSesion, authRole(['admin', 'gerente', 'cajero']), async (req, res) => {
    const { turno, monto_inicial, detalles } = req.body;
    const restauranteId = req.session.usuario.restaurante_id;
    const usuarioId = req.session.usuario.id;

    try {
        const { error } = await supabase
            .from('cortes_caja')
            .insert({
                restaurante_id: restauranteId,
                fecha: hoyISO(),
                turno,
                usuario_id: usuarioId,
                monto_apertura: monto_inicial,
                detalles_dinero: detalles,
                estado: 'abierta'
            });

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// =======================================================
// CERRAR CAJA (REALIZAR CORTE)
// =======================================================
router.post('/cerrar', verificarSesion, authRole(['admin', 'gerente', 'cajero']), async (req, res) => {
    const { caja_id, monto_final, detalles } = req.body;
    const restauranteId = req.session.usuario.restaurante_id;

    try {
        // 1. Obtener la sesión de caja exacta antes de calcular ventas.
        const { data: caja, error: errCaja } = await supabase
            .from('cortes_caja')
            .select('monto_apertura, created_at, estado')
            .eq('id', caja_id)
            .eq('restaurante_id', restauranteId)
            .maybeSingle();

        if (errCaja) throw errCaja;
        if (!caja || caja.estado !== 'abierta') {
            return res.status(409).json({ error: 'La caja no existe, no pertenece al restaurante o ya fue cerrada.' });
        }

        // 2. Solo contar efectivo vendido DESDE la apertura de esta caja, no todo el día.
        const cierreISO = new Date().toISOString();
        const { data: facturas, error: errFacturas } = await supabase
            .from('facturas')
            .select('total')
            .eq('forma_pago', 'efectivo')
            .eq('estado', 'activa')
            .eq('restaurante_id', restauranteId)
            .gte('fecha', caja.created_at)
            .lte('fecha', cierreISO);

        if (errFacturas) throw errFacturas;
        const ventasSistema = (facturas || []).reduce((sum, f) => sum + Number(f.total || 0), 0);

        const montoInicial = Number(caja.monto_apertura);

        // 3. Calcular Diferencia: (Lo que conté) - (Lo que debería haber)
        const diferencia = Number(monto_final) - (montoInicial + ventasSistema);

        // 4. Actualizar
        const { error: errUpdate } = await supabase
            .from('cortes_caja')
            .update({
                monto_cierre: monto_final,
                ventas_efectivo: ventasSistema,
                diferencia,
                detalles_dinero: detalles,
                estado: 'cerrada',
                cerrado_at: new Date().toISOString()
            })
            .eq('id', caja_id)
            .eq('restaurante_id', restauranteId);

        if (errUpdate) throw errUpdate;

        res.json({ success: true, diferencia });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// =======================================================
// EXPORTAR EXCEL INDIVIDUAL O DIARIO
// =======================================================
router.get('/exportar/:id?', verificarSesion, authRole(['admin', 'gerente', 'cajero']), async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;
        const workbook = new excel.Workbook();
        const sheet = workbook.addWorksheet('Corte de Caja');

        // SEGURIDAD: Solo trae cortes de ESTE restaurante
        let q = supabase
            .from('cortes_caja')
            .select('*')
            .eq('fecha', hoyISO())
            .eq('restaurante_id', restauranteId);

        if (req.params.id && req.params.id !== 'diario') {
            q = q.eq('id', req.params.id);
        }

        const { data: cortes, error } = await q;
        if (error) throw error;

        sheet.columns = [
            { header: 'Turno', key: 'turno', width: 10 },
            { header: 'Estado', key: 'estado', width: 10 },
            { header: 'Inicial', key: 'inicial', width: 15 },
            { header: '+ Ventas Efec.', key: 'ventas', width: 15 },
            { header: '= Esperado', key: 'esperado', width: 15 },
            { header: 'Real (Contado)', key: 'final', width: 15 },
            { header: 'Diferencia', key: 'diferencia', width: 15 },
        ];

        (cortes || []).forEach(c => {
            const esperado = Number(c.monto_apertura) + Number(c.ventas_efectivo || 0);
            const row = sheet.addRow({
                turno: c.turno || 'Único',
                estado: String(c.estado).toUpperCase(),
                inicial: c.monto_apertura,
                ventas: c.ventas_efectivo || 0,
                esperado: esperado,
                final: c.monto_cierre || 0,
                diferencia: c.diferencia || 0
            });

            const cellDif = row.getCell('diferencia');
            if (Number(c.diferencia) < 0) {
                cellDif.font = { color: { argb: 'FFFF0000' }, bold: true };
                cellDif.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0E0' } };
            } else {
                cellDif.font = { color: { argb: 'FF008000' }, bold: true };
            }
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Corte_${req.params.id || 'Diario'}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error(error);
        res.status(500).send('Error generando excel');
    }
});

module.exports = router;
