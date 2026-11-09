const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { verificarSesion } = require('../middlewares/authMiddleware');
const { formatTimeInTimeZone } = require('../utils/business-time');

const TIMEZONE_DEFAULT = 'America/El_Salvador';

// ================================================================
// Middleware: Solo admin y cajero
// ================================================================
const soloAdminCajero = (req, res, next) => {
    if (!['admin', 'gerente', 'cajero'].includes(req.session.usuario.rol)) {
        return res.status(403).render('error', { 
            error: { message: 'Solo administración y caja pueden acceder' } 
        });
    }
    next();
};

async function getTimeZone(restauranteId) {
    const { data } = await supabase
        .from('restaurantes')
        .select('timezone')
        .eq('id', restauranteId)
        .maybeSingle();
    return data?.timezone || TIMEZONE_DEFAULT;
}

function formatearPedido(pedido, timeZone) {
    return {
        ...pedido,
        hora_local: formatTimeInTimeZone(timeZone, pedido.created_at, { seconds: true }),
        cliente_nombre: pedido.clientes?.nombre || pedido.mesas?.descripcion || null
    };
}

async function obtenerDetallePedido(restauranteId, pedidoId, conUsuario = true) {
    const itemsSelect = conUsuario
        ? `id, cantidad, precio_unitario, subtotal, estado, nota, created_at, enviado_at, usuario_id,
           productos:producto_id(nombre, categoria),
           usuarios:usuario_id(nombre)`
        : `id, cantidad, precio_unitario, subtotal, estado, nota, created_at, enviado_at,
           productos:producto_id(nombre, categoria)`;

    const { data, error } = await supabase
        .from('pedidos')
        .select(`
            id, estado, total, notas, created_at, updated_at,
            mesas:mesa_id(numero, descripcion),
            clientes:cliente_id(nombre, telefono),
            pedido_items(${itemsSelect})
        `)
        .eq('id', pedidoId)
        .eq('restaurante_id', restauranteId)
        .maybeSingle();

    // La columna usuario_id puede no existir todavía si la migración de
    // autoría no se aplicó. En ese caso el detalle sigue funcionando.
    if (error && conUsuario && (error.code === '42703' || /usuario_id/i.test(error.message || ''))) {
        return obtenerDetallePedido(restauranteId, pedidoId, false);
    }
    if (error) throw error;
    return data;
}

// ================================================================
// GET /registro-pedidos - Panel principal
// ================================================================
router.get('/', verificarSesion, soloAdminCajero, async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;
        const { desde, hasta, mesa_id, estado } = req.query;

        // Valores por defecto: hoy
        const hoy = new Date().toISOString().split('T')[0];
        const fechaDesde = desde || hoy;
        const fechaHasta = hasta || hoy;
        const timeZone = await getTimeZone(restauranteId);

        let query = supabase
            .from('pedidos')
            .select(`
                id, estado, total, created_at, updated_at,
                mesas:mesa_id(numero, descripcion),
                clientes:cliente_id(nombre),
                pedido_items(
                    id, cantidad, precio_unitario, subtotal, estado,
                    productos:producto_id(nombre, categoria)
                )
            `)
            .eq('restaurante_id', restauranteId)
            .gte('created_at', `${fechaDesde}T00:00:00`)
            .lte('created_at', `${fechaHasta}T23:59:59`)
            .order('created_at', { ascending: false });

        if (mesa_id) {
            query = query.eq('mesa_id', parseInt(mesa_id));
        }

        if (estado) {
            query = query.eq('estado', estado);
        }

        const { data: pedidos, error } = await query;
        if (error) throw error;

        // Obtener lista de mesas para filtro
        const { data: mesas } = await supabase
            .from('mesas')
            .select('id, numero')
            .eq('restaurante_id', restauranteId)
            .order('numero');

        res.render('registro_pedidos', {
            usuario: req.session.usuario,
            pedidos: (pedidos || []).map(p => formatearPedido(p, timeZone)),
            mesas: mesas || [],
            filtros: { desde: fechaDesde, hasta: fechaHasta, mesa_id: mesa_id || '', estado: estado || '' }
        });

    } catch (error) {
        console.error('Error al cargar registro de pedidos:', error.message);
        res.status(500).render('error', { error: { message: 'No se pudo cargar el registro de pedidos.' } });
    }
});

// ================================================================
// GET /registro-pedidos/api - API para carga dinámica
// ================================================================
router.get('/api/lista', verificarSesion, soloAdminCajero, async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;
        const { desde, hasta, mesa_id, estado } = req.query;

        const hoy = new Date().toISOString().split('T')[0];
        const fechaDesde = desde || hoy;
        const fechaHasta = hasta || hoy;
        const timeZone = await getTimeZone(restauranteId);

        let query = supabase
            .from('pedidos')
            .select(`
                id, estado, total, created_at,
                mesas:mesa_id(numero, descripcion),
                clientes:cliente_id(nombre),
                pedido_items(
                    id, cantidad, precio_unitario,
                    productos:producto_id(nombre)
                )
            `)
            .eq('restaurante_id', restauranteId)
            .gte('created_at', `${fechaDesde}T00:00:00`)
            .lte('created_at', `${fechaHasta}T23:59:59`)
            .order('created_at', { ascending: false });

        if (mesa_id) query = query.eq('mesa_id', parseInt(mesa_id));
        if (estado) query = query.eq('estado', estado);

        const { data, error } = await query;
        if (error) throw error;

        res.json((data || []).map(p => formatearPedido(p, timeZone)));

    } catch (error) {
        console.error('Error en registro de pedidos:', error.message);
        res.status(500).json({ error: 'No se pudo completar la solicitud.' });
    }
});

// ================================================================
// GET /registro-pedidos/:id - Detalle de un pedido
// ================================================================
router.get('/detalle/:id', verificarSesion, soloAdminCajero, async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;
        const pedidoId = req.params.id;

        const pedido = await obtenerDetallePedido(restauranteId, pedidoId);
        if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

        const timeZone = await getTimeZone(restauranteId);
        const respuesta = {
            ...pedido,
            comanda_numero: pedido.id,
            hora_local: formatTimeInTimeZone(timeZone, pedido.created_at, { seconds: true }),
            cliente_nombre: pedido.clientes?.nombre || pedido.mesas?.descripcion || null,
            pedido_items: [...(pedido.pedido_items || [])]
                .sort((a, b) => Number(a.id) - Number(b.id))
                .map(item => ({
                    ...item,
                    usuario_nombre: item.usuarios?.nombre || null,
                    hora_local: formatTimeInTimeZone(timeZone, item.created_at, { seconds: true }),
                    enviado_local: item.enviado_at
                        ? formatTimeInTimeZone(timeZone, item.enviado_at, { seconds: true })
                        : null
                }))
        };

        res.json(respuesta);

    } catch (error) {
        console.error('Error en registro de pedidos:', error.message);
        res.status(500).json({ error: 'No se pudo completar la solicitud.' });
    }
});

// ================================================================
// GET /registro-pedidos/reporte - Reporte del período
// ================================================================
router.get('/reporte', verificarSesion, soloAdminCajero, async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;
        const { desde, hasta } = req.query;

        const hoy = new Date().toISOString().split('T')[0];
        const fechaDesde = desde || hoy;
        const fechaHasta = hasta || hoy;

        const { data: pedidos, error } = await supabase
            .from('pedidos')
            .select(`
                id, estado, total, created_at,
                mesas:mesa_id(numero),
                pedido_items(
                    cantidad, subtotal, estado,
                    productos:producto_id(nombre, categoria)
                )
            `)
            .eq('restaurante_id', restauranteId)
            .gte('created_at', `${fechaDesde}T00:00:00`)
            .lte('created_at', `${fechaHasta}T23:59:59`);

        if (error) throw error;

        // Calcular resumen
        let totalPedidos = pedidos?.length || 0;
        let totalVentas = 0;
        let pedidosCompletos = 0;
        let pedidosAbertos = 0;
        const resumenPorEstado = {};
        const productosMasVendidos = {};

        (pedidos || []).forEach(p => {
            totalVentas += Number(p.total);
            if (p.estado === 'cerrado') pedidosCompletos++;
            if (p.estado === 'abierto') pedidosAbertos++;

            resumenPorEstado[p.estado] = (resumenPorEstado[p.estado] || 0) + 1;

            (p.pedido_items || []).forEach(it => {
                const nombre = it.productos?.nombre || 'Producto';
                if (!productosMasVendidos[nombre]) {
                    productosMasVendidos[nombre] = { cantidad: 0, ingresos: 0 };
                }
                productosMasVendidos[nombre].cantidad += Number(it.cantidad);
                productosMasVendidos[nombre].ingresos += Number(it.subtotal);
            });
        });

        res.json({
            periodo: { desde: fechaDesde, hasta: fechaHasta },
            resumen: {
                total_pedidos: totalPedidos,
                total_ventas: totalVentas.toFixed(2),
                pedidos_completos: pedidosCompletos,
                pedidos_abiertos: pedidosAbertos,
                promedio_venta: totalPedidos > 0 ? (totalVentas / totalPedidos).toFixed(2) : 0
            },
            por_estado: resumenPorEstado,
            productos_top: Object.entries(productosMasVendidos)
                .sort((a, b) => b[1].ingresos - a[1].ingresos)
                .slice(0, 10)
                .map(([nombre, datos]) => ({ nombre, ...datos }))
        });

    } catch (error) {
        console.error('Error en registro de pedidos:', error.message);
        res.status(500).json({ error: 'No se pudo completar la solicitud.' });
    }
});

module.exports = router;
