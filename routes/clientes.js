const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// IMPORTAR AL GUARDIA DE SEGURIDAD
const { verificarSesion } = require('../middlewares/authMiddleware');

// ==========================================
// 1. GET /clientes - Mostrar página
// ==========================================
router.get('/', verificarSesion, async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;

        // SEGURIDAD: Solo clientes de este restaurante
        const { data: clientes, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('restaurante_id', restauranteId)
            .order('nombre', { ascending: true });

        if (error) throw error;

        res.render('clientes', { clientes: clientes || [] });
    } catch (error) {
        console.error('Error al obtener clientes:', error);
        res.status(500).render('error', {
            error: {
                message: 'Error al obtener clientes',
                stack: error.stack
            }
        });
    }
});

// ==========================================
// 2. GET /clientes/buscar - Buscar clientes (AJAX)
// ==========================================
router.get('/buscar', verificarSesion, async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;
        const query = req.query.q || '';
        const searchTerm = `%${query}%`;

        // SEGURIDAD: Filtramos por restaurante
        const { data: clientes, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('restaurante_id', restauranteId)
            .or(`nombre.ilike.${searchTerm},telefono.ilike.${searchTerm}`)
            .order('nombre', { ascending: true })
            .limit(10);

        if (error) throw error;

        res.json(clientes || []);
    } catch (error) {
        console.error('Error al buscar clientes:', error);
        res.status(500).json({ error: 'Error al buscar clientes' });
    }
});

// ==========================================
// 3. GET /clientes/:id - Obtener un cliente específico
// ==========================================
router.get('/:id', verificarSesion, async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;

        // SEGURIDAD: Valida que el ID del cliente pertenezca a este restaurante
        const { data: cliente, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('id', req.params.id)
            .eq('restaurante_id', restauranteId)
            .maybeSingle();

        if (error) throw error;

        if (!cliente) {
            return res.status(404).json({ error: 'Cliente no encontrado o no autorizado' });
        }
        res.json(cliente);
    } catch (error) {
        console.error('Error al obtener cliente:', error);
        res.status(500).json({ error: 'Error al obtener cliente' });
    }
});

// ==========================================
// 4. POST /clientes - Crear nuevo cliente
// ==========================================
router.post('/', verificarSesion, async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;
        const { nombre, direccion, telefono } = req.body;

        if (!nombre) {
            return res.status(400).json({ error: 'El nombre es requerido' });
        }

        // SEGURIDAD: Inyectamos el restaurante_id al guardar
        const { data: cliente, error } = await supabase
            .from('clientes')
            .insert({
                restaurante_id: restauranteId,
                nombre,
                direccion: direccion || null,
                telefono: telefono || null
            })
            .select('id')
            .single();

        if (error) throw error;

        res.status(201).json({
            id: cliente.id,
            message: 'Cliente creado exitosamente'
        });
    } catch (error) {
        console.error('Error al crear cliente:', error);
        res.status(500).json({ error: 'Error al crear cliente' });
    }
});

// ==========================================
// 5. PUT /clientes/:id - Actualizar cliente
// ==========================================
router.put('/:id', verificarSesion, async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;
        const { nombre, direccion, telefono } = req.body;

        if (!nombre) {
            return res.status(400).json({ error: 'El nombre es requerido' });
        }

        // SEGURIDAD: Solo permite actualizar si es de su restaurante
        const { data, error } = await supabase
            .from('clientes')
            .update({ nombre, direccion: direccion || null, telefono: telefono || null })
            .eq('id', req.params.id)
            .eq('restaurante_id', restauranteId)
            .select('id');

        if (error) throw error;

        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado o no autorizado para editar' });
        }

        res.json({ message: 'Cliente actualizado exitosamente' });
    } catch (error) {
        console.error('Error al actualizar cliente:', error);
        res.status(500).json({ error: 'Error al actualizar cliente' });
    }
});

// ==========================================
// 6. DELETE /clientes/:id - Eliminar cliente
// ==========================================
router.delete('/:id', verificarSesion, async (req, res) => {
    try {
        const restauranteId = req.session.usuario.restaurante_id;

        // SEGURIDAD: Solo permite eliminar si es de su restaurante
        const { data, error } = await supabase
            .from('clientes')
            .delete()
            .eq('id', req.params.id)
            .eq('restaurante_id', restauranteId)
            .select('id');

        if (error) {
            // Postgres: violación de FK (el cliente tiene facturas asociadas)
            if (error.code === '23503') {
                return res.status(400).json({ error: 'No se puede eliminar el cliente porque tiene facturas asociadas' });
            }
            throw error;
        }

        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado o no autorizado para eliminar' });
        }

        res.json({ message: 'Cliente eliminado exitosamente' });
    } catch (error) {
        console.error('Error al eliminar cliente:', error);
        res.status(500).json({ error: 'Error al eliminar cliente' });
    }
});

module.exports = router;
