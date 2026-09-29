const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// =====================================================
// 1. VISTA PRINCIPAL (GET /desperdicios)
// =====================================================
router.get('/', async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;
        const { desde, hasta, producto_id, motivo } = req.query;

        // Obtener lista de productos para el select del modal/filtros
        const { data: productos } = await supabase
            .from('productos')
            .select('id, nombre')
            .eq('restaurante_id', restauranteId)
            .order('nombre');

        // Construir Query de Desperdicios
        let query = supabase
            .from('desperdicios')
            .select('*, productos(nombre), usuarios(nombre)')
            .eq('restaurante_id', restauranteId);

        // Aplicar filtros si existen
        if (desde) query = query.gte('created_at', desde);
        if (hasta) query = query.lte('created_at', `${hasta}T23:59:59`);
        if (producto_id) query = query.eq('producto_id', producto_id);
        if (motivo) query = query.eq('motivo', motivo);

        const { data: desperdicios, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        // Calcular Estadísticas para los KPI Cards
        const stats = {
            totalRegistros: desperdicios?.length || 0,
            totalCantidad: desperdicios?.reduce((acc, d) => acc + parseFloat(d.cantidad), 0).toFixed(2) || 0,
            topProducto: desperdicios?.length > 0 ? desperdicios[0].productos?.nombre : 'N/A',
            topMotivo: desperdicios?.length > 0 ? desperdicios[0].motivo : 'N/A'
        };

        res.render('desperdicios', {
            stats,
            filtros: { 
                desde: desde || '', 
                hasta: hasta || '', 
                producto_id: producto_id || '', 
                motivo: motivo || '' 
            },
            productos: productos || [],
            desperdicios: desperdicios || []
        });

    } catch (error) {
        console.error('Error en GET /desperdicios:', error);
        res.status(500).send('Error al cargar el panel de desperdicios');
    }
});

// =====================================================
// 2. REGISTRAR DESPERDICIO (POST /desperdicios)
// =====================================================
router.post('/', async (req, res) => {
    try {
        const { producto_id, cantidad, motivo, notas, unidad_medida } = req.body;
        const restauranteId = req.session.usuario.restaurante_id;
        const usuarioId = req.session.usuario.id;
        const productoId = Number(producto_id);
        const qty = Number(cantidad);
        const motivoSeguro = String(motivo || '').trim().slice(0, 80);
        const unidad = ['UND','KG','LB'].includes(String(unidad_medida || '').toUpperCase()) ? String(unidad_medida).toUpperCase() : 'UND';
        if (!Number.isInteger(productoId) || !Number.isFinite(qty) || qty <= 0 || !motivoSeguro) {
            return res.status(400).json({ ok: false, error: 'Datos de desperdicio inválidos.' });
        }
        const { data: producto, error: productoError } = await supabase
            .from('productos').select('id').eq('id', productoId).eq('restaurante_id', restauranteId).maybeSingle();
        if (productoError) throw productoError;
        if (!producto) return res.status(404).json({ ok: false, error: 'Producto no encontrado.' });

        const { data, error } = await supabase
            .from('desperdicios')
            .insert([{
                producto_id: productoId,
                cantidad: qty,
                motivo: motivoSeguro,
                notas: String(notas || '').trim().slice(0, 500) || null,
                unidad_medida: unidad,
                restaurante_id: restauranteId,
                registrado_por: usuarioId
            }])
            .select();

        if (error) throw error;

        res.json({ ok: true, message: 'Desperdicio registrado correctamente', data });
    } catch (error) {
        console.error('Error en POST /desperdicios:', error);
        res.status(500).json({ ok: false, error: 'No se pudo registrar el desperdicio' });
    }
});

// =====================================================
// 3. ELIMINAR (DELETE /desperdicios/:id)
// =====================================================
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const restauranteId = req.session.usuario.restaurante_id;

        // 1. Verificar antigüedad (Regla de 1 hora)
        const { data: registro } = await supabase
            .from('desperdicios')
            .select('created_at')
            .eq('id', id)
            .eq('restaurante_id', restauranteId)
            .maybeSingle();

        if (!registro) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });

        const fechaCreacion = new Date(registro.created_at);
        const ahora = new Date();
        const diferenciaHoras = (ahora - fechaCreacion) / (1000 * 60 * 60);

        if (diferenciaHoras > 1) {
            return res.status(403).json({ ok: false, error: 'No se pueden eliminar registros con más de 1 hora de antigüedad' });
        }

        // 2. Proceder con la eliminación
        const { error } = await supabase
            .from('desperdicios')
            .delete()
            .eq('id', id)
            .eq('restaurante_id', restauranteId);

        if (error) throw error;

        res.json({ ok: true, message: 'Registro eliminado' });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// =====================================================
// 4. API PARA REPORTES (GET /desperdicios/reporte)
// =====================================================
router.get('/reporte', async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;
        const { desde, hasta } = req.query;

        let query = supabase
            .from('desperdicios')
            .select('*, productos(nombre)')
            .eq('restaurante_id', restauranteId);

        if (desde) query = query.gte('created_at', desde);
        if (hasta) query = query.lte('created_at', `${hasta}T23:59:59`);

        const { data: registros, error } = await query;
        if (error) throw error;

        // Procesar datos para el reporte (Agrupación básica)
        const porProducto = {};
        const porMotivo = {};

        registros.forEach(r => {
            const nombre = r.productos?.nombre || 'Desconocido';
            // Por Producto
            if (!porProducto[nombre]) {
                porProducto[nombre] = { nombre, cantidad: 0, movimientos: 0, unidad: r.unidad_medida };
            }
            porProducto[nombre].cantidad += parseFloat(r.cantidad);
            porProducto[nombre].movimientos++;

            // Por Motivo
            if (!porMotivo[r.motivo]) {
                porMotivo[r.motivo] = { count: 0, cantidad: 0 };
            }
            porMotivo[r.motivo].count++;
            porMotivo[r.motivo].cantidad += parseFloat(r.cantidad);
        });

        res.json({
            periodo: { desde: desde || 'Inicio', hasta: hasta || 'Hoy' },
            resumen: {
                total_lineas: registros.length,
                total_cantidad: registros.reduce((acc, curr) => acc + parseFloat(curr.cantidad), 0).toFixed(2),
                productos_afectados: Object.keys(porProducto).length
            },
            por_producto: Object.values(porProducto),
            por_motivo: porMotivo,
            detalle: registros // Para el CSV que genera el frontend
        });

    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// =====================================================
// API LISTA DESPERDICIOS (Para refrescar sin recargar página)
// GET /desperdicios/api/lista
// =====================================================
router.get('/api/lista', async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;
        const { desde, hasta, producto_id, motivo } = req.query;

        let query = supabase
            .from('desperdicios')
            .select('*, productos(nombre), usuarios(nombre)')
            .eq('restaurante_id', restauranteId);

        if (desde) query = query.gte('created_at', desde);
        if (hasta) query = query.lte('created_at', `${hasta}T23:59:59`);
        if (producto_id) query = query.eq('producto_id', producto_id);
        if (motivo) query = query.eq('motivo', motivo);

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        res.json(data || []); // El frontend espera el array directamente
    } catch (error) {
        console.error('Error en API desperdicios:', error);
        res.status(500).json({ error: 'Error al cargar datos' });
    }
});

module.exports = router;