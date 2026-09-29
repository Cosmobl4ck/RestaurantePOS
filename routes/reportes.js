const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { verificarSesion } = require('../middlewares/authMiddleware');

// reportes.js actualmente estaba usando `db.query` (MySQL) pero el proyecto corre con Supabase.
// Se reemplaza por consultas Supabase para evitar error "db is not defined".
router.get('/', verificarSesion, async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;

        const ahora = new Date();
        const fechaHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
        const fechaHoyISO = fechaHoy.toISOString();
        const fechaManana = new Date(fechaHoy.getTime() + 24 * 60 * 60 * 1000);
        const fechaMananaISO = fechaManana.toISOString();

        // 1) Ingresos de hoy
        const { data: facturasHoy } = await supabase
            .from('facturas')
            .select('total')
            .eq('restaurante_id', restauranteId)
            .eq('estado', 'activa')
            .gte('fecha', fechaHoyISO)
            .lt('fecha', fechaMananaISO);

        const ingresosHoy = (facturasHoy || []).reduce((acc, f) => acc + Number(f.total || 0), 0);

        // 2) Pedidos hoy (cantidad de facturas activas)
        const pedidosHoy = (facturasHoy || []).length;

        // 3) Stock crítico
        const { data: stockCritico } = await supabase
            .from('productos')
            .select('nombre, stock, stock_minimo, maneja_stock')
            .eq('restaurante_id', restauranteId)
            .eq('maneja_stock', true);

        const stockCriticoFiltrado = (stockCritico || []).filter(p => Number(p.stock || 0) <= Number(p.stock_minimo || 0));

        // 4) Ventas de la semana (últimos 7 días)
        const fechaSemana = new Date(fechaHoy.getTime() - 6 * 24 * 60 * 60 * 1000);
        const { data: facturasSemana } = await supabase
            .from('facturas')
            .select('fecha, total')
            .eq('restaurante_id', restauranteId)
            .eq('estado', 'activa')
            .gte('fecha', fechaSemana.toISOString());

        const ventasSemanaMap = new Map();
        (facturasSemana || []).forEach(f => {
            const d = new Date(f.fecha);
            const key = d.toISOString().slice(0, 10);
            ventasSemanaMap.set(key, (ventasSemanaMap.get(key) || 0) + Number(f.total || 0));
        });

        const ventasSemana = Array.from(ventasSemanaMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([dia, total]) => ({ dia, total }));

        // 5) Top 5 productos (aprox: se calcula desde pedido_items)
        const { data: pedidoItemsTop } = await supabase
            .from('pedido_items')
            .select('producto_id, cantidad, productos(nombre)')
            .eq('restaurante_id', restauranteId)
            .neq('estado', 'cancelado');

        const topMap = new Map();
        (pedidoItemsTop || []).forEach(it => {
            const key = it.producto_id;
            const nombre = it.productos?.nombre;
            topMap.set(key, {
                nombre,
                total_vendido: (topMap.get(key)?.total_vendido || 0) + Number(it.cantidad || 0)
            });
        });

        const topProductos = Array.from(topMap.values())
            .sort((a, b) => b.total_vendido - a.total_vendido)
            .slice(0, 5);

        // 6) Anulaciones de la semana
        const { data: facturasAnuladas } = await supabase
            .from('facturas')
            .select('fecha')
            .eq('restaurante_id', restauranteId)
            .eq('estado', 'anulada')
            .gte('fecha', fechaSemana.toISOString());

        const anulacionesMap = new Map();
        (facturasAnuladas || []).forEach(f => {
            const d = new Date(f.fecha);
            const key = d.toISOString().slice(0, 10);
            anulacionesMap.set(key, (anulacionesMap.get(key) || 0) + 1);
        });

        const anulacionesSemana = Array.from(anulacionesMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([dia, cantidad]) => ({ dia, cantidad }));

        res.render('reportes', {
            stats: {
                ingresosHoy,
                pedidosHoy,
                stockCritico: stockCriticoFiltrado,
                ventasSemana,
                topProductos,
                anulacionesSemana
            },
            usuario: req.session.usuario
        });

    } catch (error) {
        console.error("Error en reportes:", error);
        res.status(500).send("Error interno: " + error.message);
    }
});

// Ruta adicional para el JSON del PDF (Blindada)
router.get('/lista-compras', verificarSesion, async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;

        // Consulta a Supabase para obtener la lista de compras
        const { data: productos, error } = await supabase
            .from('productos')
            .select('nombre, stock, stock_minimo')
            .eq('restaurante_id', restauranteId)
            .eq('categoria', 'Bar')
            .order('nombre', { ascending: true });

        if (error) {
            throw new Error(`Error al obtener productos: ${error.message}`);
        }

        // Mandamos los datos al frontend
        res.json(productos || []);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener la lista: ' + error.message });
    }
});

module.exports = router;