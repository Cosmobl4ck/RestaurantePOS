const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { verificarSesion } = require('../middlewares/authMiddleware');
const authRole = require('../middlewares/authRole');
const { registrarAuditoria } = require('../services/auditService');

// ===================================
// 1. RUTA PRINCIPAL (LISTADO + HISTORIAL)
// ===================================
router.get('/', verificarSesion, authRole(['admin','gerente','cajero']), async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;

        // Consulta a Supabase para obtener el historial de facturas
        const { data: facturas, error } = await supabase
            .from('facturas')
            .select(`
                id,
                fecha,
                total,
                forma_pago,
                estado,
                motivo_anulacion,
                fecha_anulacion,
                usuarios:anulado_por(nombre),
                clientes:cliente_id(nombre)
            `)
            .eq('restaurante_id', restauranteId)
            .order('fecha', { ascending: false })
            .limit(100);

        if (error) {
            throw new Error(`Error al obtener facturas: ${error.message}`);
        }

        // Transformar los datos para la vista
        const facturasTransformadas = (facturas || []).map(f => ({
            ...f,
            usuario_anulo_nombre: f.usuarios?.nombre || null,
            cliente_nombre: f.clientes?.nombre || 'Consumidor Final'
        }));

        res.render('facturas', {
            title: 'Historial de Facturas',
            facturas: facturasTransformadas,
            usuario: req.session.usuario // Para que el navbar sepa quién eres
        });

    } catch (error) {
        console.error("Error al cargar historial:", error.message);
        res.status(500).send("Error interno del servidor.");
    }
});

// ========================================
// 2. RUTA PARA ANULAR Y DEVOLVER STOCK
// ========================================
router.post('/anular/:id', verificarSesion, authRole(['admin','gerente','cajero']), async (req, res) => {
    const restauranteId = req.session.usuario.restaurante_id;
    try {
        const { data, error } = await supabase.rpc('pos_void_invoice', {
            p_restaurante_id: Number(restauranteId),
            p_factura_id: Number(req.params.id),
            p_usuario_id: Number(req.session.usuario.id),
            p_motivo: String(req.body.motivo || '').slice(0, 500)
        });
        if (error) throw error;
        await registrarAuditoria(req, {
            accion: 'factura.anular',
            entidad: 'factura',
            entidadId: req.params.id,
            detalle: {
                motivo: String(req.body.motivo || '').slice(0, 200),
                already_voided: Boolean(data?.already_voided)
            }
        });
        res.json({ success: true, ...data });
    } catch (error) {
        console.error('❌ Error al anular:', error.message);
        const status = /no encontrada/i.test(error.message || '') ? 404 : 500;
        res.status(status).json({ success: false, error: status === 404 ? 'Factura no encontrada.' : 'No se pudo anular la factura.' });
    }
});

// ==========================================
// 3. RUTA PARA EL POP-UP DE DETALLE ( SweetAlert )
// ==========================================
router.get('/detalle/:id', verificarSesion, authRole(['admin','gerente','cajero']), async (req, res) => {
    try {
        const facturaId = Number(req.params.id);
        const restauranteId = req.session.usuario.restaurante_id;
        if (!Number.isInteger(facturaId)) return res.status(400).json({ error: 'Factura inválida.' });

        // 1. Obtener encabezado — validar que pertenece al restaurante
        const { data: factura, error: facturaError } = await supabase
            .from('facturas')
            .select('id, fecha, forma_pago, total, clientes:cliente_id(nombre)')
            .eq('id', facturaId)
            .eq('restaurante_id', restauranteId)
            .maybeSingle();

        if (facturaError) throw facturaError;

        if (!factura) {
            return res.status(404).json({ error: 'Factura no encontrada' });
        }

        // 2. Obtener productos vinculados
        const { data: detalles, error: detallesError } = await supabase
            .from('detalle_factura')
            .select('cantidad, precio_unitario, unidad_medida, subtotal, productos:producto_id(nombre)')
            .eq('factura_id', facturaId)
            .eq('restaurante_id', restauranteId);

        if (detallesError) throw detallesError;

        // 3. Responder con los datos
        res.json({
            factura: {
                id: factura.id,
                fecha_cierre: factura.fecha,
                forma_pago: factura.forma_pago,
                total: factura.total,
                cliente_nombre: factura.clientes?.nombre || 'Consumidor Final'
            },
            detalles: (detalles || []).map(d => ({
                cantidad: d.cantidad,
                precio_unitario: d.precio_unitario,
                unidad_medida: d.unidad_medida || 'UND',
                subtotal: d.subtotal,
                producto_nombre: d.productos?.nombre || 'Producto eliminado'
            }))
        });

    } catch (error) {
        console.error('❌ Error al obtener detalle de factura:', error.message);
        res.status(500).json({ error: 'Error al obtener el detalle.' });
    }
});

// ===================================
// 4. VISTA PREVIA E IMPRESIÓN
// ===================================
router.get('/:id/imprimir', verificarSesion, authRole(['admin','gerente','cajero']), async (req, res) => {
    try {
        const facturaId = Number(req.params.id);
        const restauranteId = req.session.usuario.restaurante_id;
        if (!Number.isInteger(facturaId)) return res.status(400).send('Factura inválida.');

        const { data: factura, error: facturaError } = await supabase
            .from('facturas')
            .select('*, clientes:cliente_id(nombre)')
            .eq('id', facturaId)
            .eq('restaurante_id', restauranteId)
            .maybeSingle();

        if (facturaError) throw facturaError;
        if (!factura) return res.status(404).send('Factura no encontrada');

        const { data: detalles, error: detallesError } = await supabase
            .from('detalle_factura')
            .select('*, productos:producto_id(nombre)')
            .eq('factura_id', facturaId)
            .eq('restaurante_id', restauranteId);

        if (detallesError) throw detallesError;

        const facturaFormateada = {
            ...factura,
            cliente_nombre: factura.clientes?.nombre || 'Consumidor Final'
        };

        const detallesFormateados = (detalles || []).map(d => ({
            ...d,
            producto_nombre: d.productos?.nombre || 'Producto eliminado'
        }));

        const { data: config } = await supabase
            .from('configuracion_impresion')
            .select('*')
            .eq('restaurante_id', restauranteId)
            .maybeSingle();

        const puedeMarca = typeof res.locals.planPuede === 'function'
            ? res.locals.planPuede('facturas.marca')
            : true;

        // Convierte el logo BYTEA a data URI (mismo criterio que /configuracion).
        const configParaVista = { ...(config || {}) };
        if (puedeMarca && config?.logo_data) {
            const hex = String(config.logo_data).replace(/^\\x/, '');
            try {
                configParaVista.logo_src = `data:image/${config.logo_tipo || 'png'};base64,${Buffer.from(hex, 'hex').toString('base64')}`;
            } catch (_) {
                configParaVista.logo_src = null;
            }
        }
        delete configParaVista.logo_data;
        delete configParaVista.qr_data;
        if (!puedeMarca) {
            configParaVista.logo_src = null;
            configParaVista.qr_src = null;
            configParaVista.pie_pagina = null;
            configParaVista.ancho_papel = 80;
            configParaVista.font_size = 1;
        }

        res.render('factura', {
            factura: facturaFormateada,
            detalles: detallesFormateados,
            config: configParaVista
        });
    } catch (error) {
        console.error('Error al imprimir factura:', error.message);
        res.status(500).send('Error al generar vista de impresion');
    }
});

// ===================================
// 5. CREAR NUEVA FACTURA
// ===================================
router.post('/', verificarSesion, authRole(['admin','gerente','cajero']), (req, res) => {
    // Eliminado por seguridad: aceptaba total/precio desde el navegador y no era transaccional.
    // Toda venta debe originarse en un pedido y usar POST /mesas/pedidos/:pedidoId/facturar.
    return res.status(410).json({
        error: 'Endpoint legado deshabilitado. Factura un pedido desde el flujo de Mesas/POS.'
    });
});

module.exports = router;