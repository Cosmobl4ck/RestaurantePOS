const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { verificarSesion } = require('../middlewares/authMiddleware');

// =========================================================
// 1. RUTA PRINCIPAL DE VENTAS (Historial)
// =========================================================
router.get('/', verificarSesion, async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;

        let query = supabase
            .from('facturas')
            .select(`
                id,
                fecha,
                total,
                forma_pago,
                estado,
                clientes:cliente_id(nombre)
            `)
            .eq('restaurante_id', restauranteId)
            .order('fecha', { ascending: false })
            .limit(200);

        // Filtro por rango de fechas
        if (req.query.desde && req.query.hasta) {
            query = query
                .gte('fecha', `${req.query.desde}T00:00:00`)
                .lte('fecha', `${req.query.hasta}T23:59:59`);
        }

        // BÃºsqueda por ID de factura
        if (req.query.q && !isNaN(req.query.q.trim())) {
            query = query.eq('id', parseInt(req.query.q.trim()));
        }

        const { data: facturas, error } = await query;
        if (error) throw error;

        const ventasTransformadas = (facturas || []).map(f => ({
            ...f,
            cliente_nombre: f.clientes?.nombre || 'Consumidor Final'
        }));

        res.render('ventas', {
            ventas: ventasTransformadas,
            usuario: req.session.usuario,
            filtros: {
                desde: req.query.desde || '',
                hasta: req.query.hasta || '',
                q: req.query.q || ''
            }
        });

    } catch (error) {
        console.error('Error al obtener ventas:', error);
        res.status(500).render('error', {
            error: { message: 'Error al cargar el historial de ventas: ' + error.message }
        });
    }
});

// =========================================================
// 2. EXPORTAR A EXCEL
// =========================================================
router.get('/export', verificarSesion, async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;

        let ExcelJS;
        try {
            ExcelJS = require('exceljs');
        } catch (e) {
            return res.status(500).send('Exportacion a Excel no disponible. Instale: pnpm install exceljs');
        }

        let query = supabase
            .from('facturas')
            .select(`id, fecha, total, forma_pago, estado, clientes:cliente_id(nombre)`)
            .eq('restaurante_id', restauranteId)
            .order('fecha', { ascending: false });

        if (req.query.desde && req.query.hasta) {
            query = query
                .gte('fecha', `${req.query.desde}T00:00:00`)
                .lte('fecha', `${req.query.hasta}T23:59:59`);
        }

        const { data: rows, error } = await query;
        if (error) throw error;

        let config = null;
        try {
            const { data: cfg } = await supabase
                .from('configuracion_impresion')
                .select('*')
                .eq('restaurante_id', restauranteId)
                .limit(1)
                .maybeSingle();
            config = cfg || null;
        } catch (_) {}

        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Ventas');

        const titulo = config?.nombre_negocio || 'Reporte de Ventas';
        const subInfo = [
            config?.direccion || null,
            config?.telefono ? `Tel: ${config.telefono}` : null,
            config?.nit ? `NIT: ${config.nit}` : null
        ].filter(Boolean).join('  \u2022  ');
        const rango = `Rango: ${req.query.desde || '-'} a ${req.query.hasta || '-'}`;

        ws.mergeCells('B1:E1');
        ws.mergeCells('B2:E2');
        ws.mergeCells('B3:E3');
        ws.getRow(1).values = ['', titulo];
        ws.getRow(2).values = ['', subInfo];
        ws.getRow(3).values = ['', rango];
        ws.getRow(1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
        ws.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D6EFD' } };
        ws.getRow(2).font = { color: { argb: 'FF0D6EFD' } };
        ws.getRow(2).alignment = { horizontal: 'center' };
        ws.getRow(3).font = { italic: true, color: { argb: 'FF495057' } };
        ws.getRow(3).alignment = { horizontal: 'center' };
        ws.getRow(1).height = 24;
        ws.getRow(2).height = 18;
        ws.getRow(3).height = 18;
        ws.addRow([]);

        const headerRow = ws.addRow(['Factura #', 'Fecha', 'Cliente', 'Forma de Pago', 'Total']);
        headerRow.font = { bold: true, color: { argb: 'FF212529' } };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9ECEF' } };
        headerRow.border = { bottom: { style: 'thin', color: { argb: 'FFADB5BD' } } };

        let totalEfectivo = 0, totalTransferencia = 0, totalGeneral = 0;

        (rows || []).forEach(r => {
            const fecha = new Date(r.fecha);
            const total = Number(r.total || 0);
            const clienteNombre = r.clientes?.nombre || 'Consumidor Final';
            totalGeneral += total;
            if (r.forma_pago === 'efectivo') totalEfectivo += total;
            else if (r.forma_pago === 'transferencia') totalTransferencia += total;

            ws.addRow([
                r.id,
                fecha.toLocaleString('es-SV'),
                clienteNombre,
                (r.forma_pago || '').charAt(0).toUpperCase() + (r.forma_pago || '').slice(1),
                total
            ]);
        });

        ws.getColumn(1).width = 12;
        ws.getColumn(2).width = 22;
        ws.getColumn(3).width = 32;
        ws.getColumn(4).width = 18;
        ws.getColumn(5).width = 14;
        ws.getColumn(5).numFmt = '[$$-409]#,##0.00';

        ws.addRow([]);
        ws.addRow(['', '', 'Total Efectivo:', '', totalEfectivo]).font = { bold: true };
        ws.addRow(['', '', 'Total Transferencia:', '', totalTransferencia]).font = { bold: true };
        ws.addRow(['', '', 'Total General:', '', totalGeneral]).font = { bold: true };
        ws.views = [{ state: 'frozen', ySplit: headerRow.number }];

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="ventas_${new Date().toISOString().slice(0,10)}.xlsx"`);
        await wb.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Error al exportar ventas:', error);
        res.status(500).send('Error al exportar: ' + error.message);
    }
});

// ===============================
// LIMPIAR TEMPORALES DEL PEDIDO
// ===============================
module.exports = router;
