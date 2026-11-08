const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { verificarSesion } = require('../middlewares/authMiddleware');
const { dateInTimeZone } = require('../utils/business-time');

const DIA_MS = 24 * 60 * 60 * 1000;

// Reportes usa la zona horaria del restaurante (no la del servidor) para que
// "hoy" y las agrupaciones por día coincidan con la caja.
router.get('/', verificarSesion, async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;

        const { data: negocio } = await supabase
            .from('restaurantes')
            .select('timezone')
            .eq('id', restauranteId)
            .maybeSingle();
        const timeZone = negocio?.timezone || 'America/El_Salvador';

        const ahora = new Date();
        const hoy = dateInTimeZone(timeZone, ahora);
        const desdeSemana = new Date(ahora.getTime() - 7 * DIA_MS);

        // 1) Facturas de los últimos 7 días: se agrupan por día local.
        const { data: facturasSemana, error: facturasError } = await supabase
            .from('facturas')
            .select('fecha, total, estado')
            .eq('restaurante_id', restauranteId)
            .eq('estado', 'activa')
            .gte('fecha', desdeSemana.toISOString());

        if (facturasError) throw facturasError;

        let ingresosHoy = 0;
        let pedidosHoy = 0;
        const ventasSemanaMap = new Map();

        (facturasSemana || []).forEach(f => {
            const dia = dateInTimeZone(timeZone, new Date(f.fecha));
            const total = Number(f.total || 0);
            if (dia === hoy) {
                ingresosHoy += total;
                pedidosHoy += 1;
            }
            ventasSemanaMap.set(dia, (ventasSemanaMap.get(dia) || 0) + total);
        });

        // Serie completa de los últimos 7 días locales, incluyendo hoy en cero.
        const diasSemana = [];
        for (let i = 6; i >= 0; i -= 1) {
            diasSemana.push(dateInTimeZone(timeZone, new Date(ahora.getTime() - i * DIA_MS)));
        }
        const ventasSemana = diasSemana.map(dia => ({
            dia,
            total: ventasSemanaMap.get(dia) || 0
        }));

        // 2) Stock crítico
        const { data: stockCritico, error: stockError } = await supabase
            .from('productos')
            .select('nombre, stock, stock_minimo, maneja_stock')
            .eq('restaurante_id', restauranteId)
            .eq('maneja_stock', true);

        if (stockError) throw stockError;

        const stockCriticoFiltrado = (stockCritico || [])
            .filter(p => Number(p.stock || 0) <= Number(p.stock_minimo || 0));

        // 3) Top productos de la semana (ventana acotada, no todo el histórico).
        const { data: pedidoItemsTop, error: topError } = await supabase
            .from('pedido_items')
            .select('producto_id, cantidad, productos(nombre)')
            .eq('restaurante_id', restauranteId)
            .neq('estado', 'cancelado')
            .gte('created_at', desdeSemana.toISOString());

        if (topError) throw topError;

        const topMap = new Map();
        (pedidoItemsTop || []).forEach(it => {
            const key = it.producto_id;
            const nombre = it.productos?.nombre || 'Producto';
            topMap.set(key, {
                nombre,
                total_vendido: (topMap.get(key)?.total_vendido || 0) + Number(it.cantidad || 0)
            });
        });

        const topProductos = Array.from(topMap.values())
            .sort((a, b) => b.total_vendido - a.total_vendido)
            .slice(0, 5);

        // 4) Anulaciones de la semana
        const { data: facturasAnuladas, error: anuladasError } = await supabase
            .from('facturas')
            .select('fecha')
            .eq('restaurante_id', restauranteId)
            .eq('estado', 'anulada')
            .gte('fecha', desdeSemana.toISOString());

        if (anuladasError) throw anuladasError;

        const anulacionesMap = new Map();
        (facturasAnuladas || []).forEach(f => {
            const dia = dateInTimeZone(timeZone, new Date(f.fecha));
            anulacionesMap.set(dia, (anulacionesMap.get(dia) || 0) + 1);
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
        console.error("Error en reportes:", error.message);
        res.status(500).send("Error interno del servidor.");
    }
});

// Ruta adicional para el JSON del PDF (Blindada)
router.get('/lista-compras', verificarSesion, async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;

        const { data: productos, error } = await supabase
            .from('productos')
            .select('nombre, stock, stock_minimo')
            .eq('restaurante_id', restauranteId)
            .eq('categoria', 'Bar')
            .order('nombre', { ascending: true });

        if (error) throw error;

        res.json(productos || []);

    } catch (error) {
        console.error('Error al obtener lista de compras:', error.message);
        res.status(500).json({ error: 'Error al obtener la lista.' });
    }
});

module.exports = router;
