const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { verificarSesion } = require('../middlewares/authMiddleware');
const { requireFeature } = require('../middlewares/planAccess');
const { requirePermission } = require('../middlewares/access');
const { registrarAuditoria } = require('../services/auditService');

async function aplicarAjustes(restauranteId, resultado, opciones = {}) {
    if (!resultado || resultado.already_invoiced || !resultado.factura_id) return resultado;

    const { data: negocio, error } = await supabase
        .from('restaurantes')
        .select('propina_porcentaje')
        .eq('id', restauranteId)
        .maybeSingle();
    if (error) throw error;

    const configurada = Math.max(0, Math.min(10, Number(negocio?.propina_porcentaje || 0)));
    const descuentoPct = Number(opciones.descuento_porcentaje ?? 0);
    if (!Number.isFinite(descuentoPct) || descuentoPct < 0 || descuentoPct > 100) {
        throw new Error('AJUSTE_DESCUENTO_INVALIDO');
    }

    // La propina solo puede quedar en la configurada, en configurada - 5, o en 0.
    const permitidas = [...new Set([
        configurada,
        Math.max(0, configurada - 5),
        0
    ].map((value) => Math.round(value * 100) / 100))];
    let propinaPct = opciones.propina_porcentaje;
    if (propinaPct === undefined || propinaPct === null || propinaPct === '') {
        propinaPct = configurada;
    } else {
        propinaPct = Math.round(Number(propinaPct) * 100) / 100;
    }
    if (!permitidas.includes(propinaPct)) {
        throw new Error('AJUSTE_PROPINA_INVALIDO');
    }

    const subtotal = Number(resultado.total || 0);
    const descuento = Math.round(subtotal * descuentoPct) / 100;
    const base = Math.max(0, Math.round((subtotal - descuento) * 100) / 100);
    const propina = Math.round(base * propinaPct) / 100;
    const total = Math.round((base + propina) * 100) / 100;
    const motivo = String(opciones.descuento_motivo || '').trim().slice(0, 200) || null;

    const { error: updateError } = await supabase
        .from('facturas')
        .update({
            subtotal,
            descuento,
            descuento_porcentaje: descuentoPct,
            descuento_motivo: motivo,
            propina,
            propina_porcentaje: propinaPct,
            total
        })
        .eq('id', resultado.factura_id)
        .eq('restaurante_id', restauranteId);
    if (updateError) throw updateError;

    return {
        ...resultado,
        subtotal,
        descuento,
        descuento_porcentaje: descuentoPct,
        descuento_motivo: motivo,
        propina,
        propina_porcentaje: propinaPct,
        total
    };
}

// =========================================================================
// GET /mesas - Renderizar vista principal
// =========================================================================
router.get('/', verificarSesion, async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;

        // 1. Obtenemos las mesas (NO order por 'numero' porque es texto: "Mesa 1, Mesa 10, Mesa 2...")
        const { data: mesas, error: errMesas } = await supabase
            .from('mesas')
            .select('*')
            .eq('restaurante_id', restauranteId);

        if (errMesas) throw errMesas;

        // 2. Obtenemos los pedidos abiertos para contar pedidos_abiertos por mesa
        const { data: pedidos, error: errPedidos } = await supabase
            .from('pedidos')
            .select('mesa_id')
            .eq('restaurante_id', restauranteId)
            .not('estado', 'in', '("cerrado","cancelado")');

        if (errPedidos) throw errPedidos;

        // Orden natural: todas las mesas diseñadas en el croquis deben ser visibles en el POS.
        // Las mesas especiales (para llevar / domicilio) se colocan al final.
        const naturalNumber = (value) => {
            const match = String(value || '').match(/(\d+)/);
            return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
        };
        const isSpecial = (value) => /domicilio|llevar/i.test(String(value || ''));
        const mesasOrdenadas = [...mesas].sort((a, b) => {
            const specialA = isSpecial(a.numero), specialB = isSpecial(b.numero);
            if (specialA !== specialB) return specialA ? 1 : -1;
            const diff = naturalNumber(a.numero) - naturalNumber(b.numero);
            return diff || String(a.numero || '').localeCompare(String(b.numero || ''), 'es', { numeric: true });
        });

        const mesasConConteo = mesasOrdenadas.map(m => ({
            ...m,
            pedidos_abiertos: pedidos.filter(p => Number(p.mesa_id) === Number(m.id)).length
        }));

        const { data: negocio } = await supabase
            .from('restaurantes')
            .select('propina_porcentaje')
            .eq('id', restauranteId)
            .maybeSingle();

        res.render('mesas', { mesas: mesasConConteo, usuario: req.session.usuario, propinaPorcentaje: Number(negocio?.propina_porcentaje || 0) });
    } catch (error) {
        console.error('Error al cargar mesas:', error);
        res.status(500).render('error', { 
            error: { message: 'Error al cargar las mesas.', stack: error.stack }
        });
    }
});

// =========================================================================
// POST /mesas/abrir - Abrir pedido
// =========================================================================
router.post('/abrir', verificarSesion, async (req, res) => {
    const { mesa_id, cliente_nombre, notas } = req.body || {};
    const restauranteId = req.session.usuario.restaurante_id;
    if (!mesa_id) return res.status(400).json({ error: 'Mesa requerida' });

    try {
        // Si la mesa ya tiene un pedido abierto, recuperarlo (idempotente).
        // pos_open_order rechaza mesas ocupadas antes de buscar el pedido existente,
        // por eso la recuperación se resuelve aquí sin tocar la base.
        const { data: pedidoExistente, error: existenteError } = await supabase
            .from('pedidos')
            .select('*')
            .eq('restaurante_id', restauranteId)
            .eq('mesa_id', Number(mesa_id))
            .not('estado', 'in', '("cerrado","cancelado")')
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (existenteError) throw existenteError;

        if (pedidoExistente) {
            return res.status(200).json({
                success: true,
                pedido: { ...pedidoExistente, existing: true }
            });
        }

        const { data, error } = await supabase.rpc('pos_open_order', {
            p_restaurante_id: Number(restauranteId),
            p_mesa_id: Number(mesa_id),
            p_cliente_nombre: String(cliente_nombre || '').slice(0, 100) || null,
            p_notas: String(notas || '').slice(0, 500) || null
        });
        if (error) throw error;
        res.status(data?.existing ? 200 : 201).json({ success: true, pedido: data });
    } catch (error) {
        console.error('Error al abrir pedido:', error.message);
        const status = /mesa|reservada|bloqueada/i.test(error.message || '') ? 409 : 500;
        res.status(status).json({ error: status === 500 ? 'Error interno del servidor.' : (error.message || 'Error al abrir pedido.') });
    }
});

// =========================================================================
// GET /mesas/pedidos/:pedidoId - DATOS PARA EL OFFCANVAS
// =========================================================================
router.get('/pedidos/:pedidoId', verificarSesion, async (req, res) => {
    try {
        const pedidoId = req.params.pedidoId;
        const restauranteId = req.session.usuario.restaurante_id;
        
        // Obtener pedido con datos de la mesa (Join)
        const { data: pedido, error: errPed } = await supabase
            .from('pedidos')
            .select('*, mesas(numero, descripcion)')
            .eq('id', pedidoId)
            .eq('restaurante_id', restauranteId)
            .single();

        if (errPed || !pedido) return res.status(404).json({ error: 'No encontrado' });
        
        // Obtener items
        const { data: items, error: errItems } = await supabase
            .from('pedido_items')
            .select('*, productos(nombre)')
            .eq('pedido_id', pedidoId)
            .eq('restaurante_id', restauranteId)
            .neq('estado', 'cancelado')
            .order('created_at', { ascending: true });

        if (errItems) throw errItems;
        
        // Mapear para mantener compatibilidad con el frontend
        const itemsFormateados = items.map(i => ({
            ...i,
            producto_nombre: i.productos?.nombre
        }));

        res.json({ 
            pedido: { ...pedido, mesa_numero: pedido.mesas?.numero, cliente_nombre: pedido.mesas?.descripcion }, 
            items: itemsFormateados 
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al consultar detalles.' });
    }
});

// =========================================================================
// POST /mesas/pedidos/:pedidoId/items - AGREGAR ITEM AL PEDIDO
// Precio y stock se resuelven atómicamente en PostgreSQL.
// =========================================================================
router.post('/pedidos/:pedidoId/items', verificarSesion, async (req, res) => {
    const restauranteId = req.session.usuario.restaurante_id;
    const { producto_id, cantidad, nota, unidad, alergia_aviso } = req.body || {};
    const qty = Number(cantidad);
    if (!producto_id || !Number.isFinite(qty) || qty <= 0 || qty > 999) {
        return res.status(400).json({ error: 'Producto/cantidad inválidos.' });
    }
    if (String(unidad || 'UND').toUpperCase() !== 'UND') {
        return res.status(400).json({ error: 'La comanda solo admite unidades UND.' });
    }
    const usuarioId = Number(req.session.usuario.id);
    if (!Number.isFinite(usuarioId)) {
        return res.status(401).json({ error: 'Sesión inválida.' });
    }
    try {
        const rpcArgs = {
            p_restaurante_id: Number(restauranteId),
            p_pedido_id: Number(req.params.pedidoId),
            p_producto_id: Number(producto_id),
            p_cantidad: qty,
            p_nota: String(nota || '').slice(0, 500) || null,
            p_unidad: 'UND',
            p_alergia_aviso: String(alergia_aviso || '').trim().slice(0, 200) || null
        };
        const funcionNoDisponible = (err) => err
            && (err.code === 'PGRST202' || /could not find the function|schema cache/i.test(err.message || ''));

        let { data, error } = await supabase.rpc('pos_add_order_item', {
            ...rpcArgs,
            p_usuario_id: usuarioId
        });

        // Compatibilidad escalonada: primero sin el aviso de alergia, luego
        // sin autoría, para que el POS siga operando antes de aplicar migraciones.
        if (funcionNoDisponible(error)) {
            const { p_alergia_aviso, ...sinAviso } = rpcArgs;
            ({ data, error } = await supabase.rpc('pos_add_order_item', {
                ...sinAviso,
                p_usuario_id: usuarioId
            }));
        }

        if (funcionNoDisponible(error)) {
            const { p_alergia_aviso, ...sinAviso } = rpcArgs;
            ({ data, error } = await supabase.rpc('pos_add_order_item', sinAviso));
        }

        if (error) throw error;
        res.status(201).json({ success: true, item: data });
    } catch (error) {
        console.error('❌ Error al agregar item:', error.message);
        const status = /stock|cantidad|pedido|producto|usuario/i.test(error.message || '') ? 400 : 500;
        res.status(status).json({ error: status === 500 ? 'Error interno del servidor.' : (error.message || 'Error al agregar item.') });
    }
});

// =========================================================================
// POST /mesas/pedidos/:pedidoId/enviar-comanda - PENDIENTE -> ENVIADO
// Idempotente: solo actualiza items todavía pendientes.
// =========================================================================
router.post('/pedidos/:pedidoId/enviar-comanda', verificarSesion, async (req, res) => {
    const restauranteId = req.session.usuario.restaurante_id;
    const pedidoId = req.params.pedidoId;
    try {
        const { data, error } = await supabase.rpc('pos_send_order', {
            p_restaurante_id: Number(restauranteId),
            p_pedido_id: Number(pedidoId)
        });
        if (error) throw error;
        res.json({ success: true, enviados: Number(data?.enviados || 0) });
    } catch (error) {
        console.error('❌ Error enviando comanda:', error.message);
        res.status(500).json({ error: 'No se pudo enviar la comanda.' });
    }
});

// =========================================================================
// POST /mesas/pedidos/:pedidoId/facturar - PROCESAR PAGO
// =========================================================================
router.post('/pedidos/:pedidoId/facturar', verificarSesion, requirePermission('sales.invoice'), async (req, res) => {
    const restauranteId = req.session.usuario.restaurante_id;
    const formaPago = String(req.body.forma_pago || 'efectivo').toLowerCase();
    if (!['efectivo', 'tarjeta', 'transferencia'].includes(formaPago)) {
        return res.status(400).json({ error: 'Forma de pago inválida.' });
    }
    try {
        const { data, error } = await supabase.rpc('pos_invoice_order', {
            p_restaurante_id: Number(restauranteId),
            p_pedido_id: Number(req.params.pedidoId),
            p_forma_pago: formaPago
        });
        if (error) throw error;
        const resultado = await aplicarAjustes(Number(restauranteId), data, {
            descuento_porcentaje: req.body.descuento_porcentaje,
            descuento_motivo: req.body.descuento_motivo,
            propina_porcentaje: req.body.propina_porcentaje
        });
        await registrarAuditoria(req, {
            accion: 'pedido.facturar',
            entidad: 'pedido',
            entidadId: req.params.pedidoId,
            detalle: {
                forma_pago: formaPago,
                factura_id: resultado?.factura_id,
                subtotal: resultado?.subtotal,
                descuento: resultado?.descuento,
                descuento_porcentaje: resultado?.descuento_porcentaje,
                propina: resultado?.propina,
                propina_porcentaje: resultado?.propina_porcentaje,
                total: resultado?.total,
                already_invoiced: Boolean(resultado?.already_invoiced)
            }
        });
        res.json({ success: true, ...(resultado || {}) });
    } catch (error) {
        console.error('❌ Error al facturar:', error.message);
        const status = /pedido|productos|pago|cancelado|AJUSTE_/i.test(error.message || '') ? 400 : 500;
        res.status(status).json({ error: status === 500 ? 'Error interno del servidor.' : (error.message || 'No se pudo facturar.') });
    }
});

// =========================================================================
// DELETE /mesas/pedidos/:pedidoId - Cancelar atómicamente pedido, stock y mesa
// =========================================================================
router.delete('/pedidos/:pedidoId', verificarSesion, requirePermission('orders.cancel'), async (req, res) => {
    const restauranteId = req.session.usuario.restaurante_id;
    try {
        const { data, error } = await supabase.rpc('pos_cancel_order', {
            p_restaurante_id: Number(restauranteId),
            p_pedido_id: Number(req.params.pedidoId)
        });
        if (error) throw error;
        await registrarAuditoria(req, {
            accion: 'pedido.cancelar',
            entidad: 'pedido',
            entidadId: req.params.pedidoId,
            detalle: {
                mesa_id: data?.mesa_id,
                already_cancelled: Boolean(data?.already_cancelled)
            }
        });
        res.json({ success: true, ...data });
    } catch (error) {
        console.error('Error cancelando pedido:', error.message);
        const status = /pedido|facturado/i.test(error.message || '') ? 409 : 500;
        res.status(status).json({ error: status === 500 ? 'Error interno del servidor.' : (error.message || 'No se pudo cancelar el pedido.') });
    }
});

// =========================================================================
// GET /mesas/listar - Devuelve todas las mesas del restaurante (para mover pedido)
// =========================================================================
router.get('/listar', verificarSesion, async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;

        const { data: mesas, error } = await supabase
            .from('mesas')
            .select('id, numero, estado')
            .eq('restaurante_id', restauranteId)
            .order('numero');

        if (error) throw error;

        res.json(mesas || []);
    } catch (error) {
        console.error('❌ Error al listar mesas:', error.message);
        res.status(500).json({ error: 'Error al obtener mesas' });
    }
});

// =========================================================================
// POST /mesas/mover-pedido - Mover un pedido de una mesa a otra
// =========================================================================
router.post('/mover-pedido', verificarSesion, requireFeature('pos.mover_pedido'), async (req, res) => {
    const { pedido_id, mesa_origen_id, mesa_destino_id } = req.body || {};
    const restauranteId = req.session.usuario.restaurante_id;
    if (!pedido_id || !mesa_origen_id || !mesa_destino_id) {
        return res.status(400).json({ error: 'Faltan datos: pedido_id, mesa_origen_id, mesa_destino_id' });
    }
    try {
        const { data, error } = await supabase.rpc('pos_move_order', {
            p_restaurante_id: Number(restauranteId),
            p_pedido_id: Number(pedido_id),
            p_mesa_origen_id: Number(mesa_origen_id),
            p_mesa_destino_id: Number(mesa_destino_id)
        });
        if (error) throw error;
        await registrarAuditoria(req, {
            accion: 'pedido.mover',
            entidad: 'pedido',
            entidadId: pedido_id,
            detalle: {
                mesa_origen_id: Number(mesa_origen_id),
                mesa_destino_id: Number(mesa_destino_id),
                mesa_destino: data?.mesa_destino
            }
        });
        res.json({ success: true, message: `Pedido movido a ${data?.mesa_destino || 'la mesa destino'}`, data });
    } catch (error) {
        console.error('❌ Error al mover pedido:', error.message);
        const status = /mesa|pedido|disponible|movible/i.test(error.message || '') ? 409 : 500;
        res.status(status).json({ success: false, error: status === 500 ? 'Error interno del servidor.' : (error.message || 'No se pudo mover el pedido.') });
    }
});

module.exports = router;
