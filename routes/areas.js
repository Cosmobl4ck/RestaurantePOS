const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

function getUsuario(req) {
    return (req.session && req.session.usuario) || req.usuario || req.user || null;
}

const CROQUIS_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const num = (value, fallback = 0, min = -5000, max = 5000) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};


// ============================================================
// GET /areas -> Vista principal para listar y crear áreas
// ============================================================
router.get('/', async (req, res) => {
    try {
        const usuario = getUsuario(req);
        if (!usuario) return res.status(401).send('No autenticado.');
        
        // 🔍 PASO CLAVE: Traemos las áreas reales de este restaurante
        const { data: areas, error } = await supabase
            .from('areas_restaurante')
            .select('*')
            .eq('restaurante_id', usuario.restaurante_id)
            .order('nombre', { ascending: true });

        if (error) throw error;

        res.render('lista-areas', { 
            usuario, 
            currentPath: req.originalUrl,
            title: 'Gestión de Áreas',
            areas: areas || [] // Pasamos el array de áreas a la vista EJS
        });
    } catch (err) {
        console.error('Error GET /areas:', err);
        res.status(500).send('Error al cargar la lista de áreas.');
    }
});

// ============================================================
// NUEVO: POST /areas/crear (Para el Modo A)
// ============================================================
router.post('/crear', async (req, res) => {
    try {
        const usuario = getUsuario(req);
        if (!usuario) return res.status(401).send('No autenticado.');

        const nombre_area = String(req.body.nombre_area || '').trim().slice(0, 100);
        if (!nombre_area) return res.status(400).send('El nombre del área es obligatorio.');

        const { data, error } = await supabase
            .from('areas_restaurante')
            .insert({ restaurante_id: usuario.restaurante_id, nombre: nombre_area })
            .select('id')
            .single();

        if (error) throw error;

        // Si se crea con éxito, redirigimos al diseñador con el ID real
        res.redirect(`/areas/editar-croquis/${data.id}`);
    } catch (err) {
        console.error('Error al crear área:', err);
        res.status(500).send('Error al crear el área.');
    }
});

// ============================================================
// GET /areas/editar-croquis/:area_id
// ============================================================
router.get('/editar-croquis/:area_id', async (req, res) => {
    try {
        const usuario = getUsuario(req);
        if (!usuario) return res.status(401).send('No autenticado.');

        const areaId = req.params.area_id;
        const restauranteId = usuario.restaurante_id;

        const { data: areaData, error: areaError } = await supabase
            .from('areas_restaurante')
            .select('*')
            .eq('id', areaId)
            .eq('restaurante_id', restauranteId)
            .single();

        if (areaError || !areaData) {
            console.warn(`⚠️ Intento de acceso a área inexistente: ${areaId}`);
            // En el Modo A estricto, si no existe, lo regresamos a crear una
            return res.redirect('/areas'); 
        }

        // Sub-áreas del croquis (figuras: Bar, Sala, VIP, etc.)
        const { data: areasData } = await supabase
            .from('croquis_areas')
            .select('*')
            .eq('area_id', areaId)
            .eq('restaurante_id', restauranteId)
            .order('created_at', { ascending: true });

        // Mesas con sus posiciones en el croquis
        const { data: mesasData } = await supabase
            .from('mesas')
            .select('*')
            .eq('area_id', areaId)
            .eq('restaurante_id', restauranteId);

        res.render('croquis', {
            usuario, currentPath: req.originalUrl,
            title: `Croquis — ${areaData.nombre}`,
            area: areaData,
            areas: areasData || [],
            mesas: mesasData || [],
        });

    } catch (err) {
        console.error('Error GET croquis:', err);
        res.status(500).send('Error interno del servidor');
    }
});

// ============================================================
// POST /areas/guardar-croquis
// ============================================================
router.post('/guardar-croquis', async (req, res) => {
    try {
        const usuario = getUsuario(req);
        if (!usuario) return res.status(401).json({ success: false, message: 'Sesión expirada.' });

        // parseInt en ambos — vienen como string desde JSON body / sesión
        const area_id = parseInt(req.body.area_id, 10);
        const areas = Array.isArray(req.body.areas) ? req.body.areas.slice(0, 100) : [];
        const mesas = Array.isArray(req.body.mesas) ? req.body.mesas.slice(0, 500) : [];
        const restaurante_id = parseInt(usuario.restaurante_id, 10);
        if (!Number.isInteger(area_id) || !Number.isInteger(restaurante_id)) {
            return res.status(400).json({ success: false, message: 'Identificadores inválidos.' });
        }
        if (areas.some(a => !CROQUIS_ID_RE.test(String(a.id || ''))) || mesas.some(m => !CROQUIS_ID_RE.test(String(m.id || '')))) {
            return res.status(400).json({ success: false, message: 'El croquis contiene identificadores inválidos.' });
        }
        const { data: areaOwner, error: areaOwnerError } = await supabase
            .from('areas_restaurante').select('id').eq('id', area_id).eq('restaurante_id', restaurante_id).maybeSingle();
        if (areaOwnerError) throw areaOwnerError;
        if (!areaOwner) return res.status(404).json({ success: false, message: 'Área no encontrada.' });

        // ── GUARDAR SUB-ÁREAS (croquis_areas) ─────────────────
        // id es TEXT generado en frontend — Supabase lo acepta como PK TEXT
        if (areas.length > 0) {
            const areasPayload = areas.map(a => ({
                id:             a.id,
                area_id:        parseInt(area_id),
                restaurante_id,
                nombre:         String(a.nombre || 'Área').trim().slice(0, 100),
                tipo:           ['rect-h','rect-v','circulo'].includes(a.tipo) ? a.tipo : 'rect-h',
                pos_x:          num(a.x),
                pos_y:          num(a.y),
                ancho:          num(a.w, 200, 50, 3000),
                alto:           num(a.h, 140, 50, 3000),
            }));

            const { error } = await supabase
                .from('croquis_areas')
                .upsert(areasPayload, { onConflict: 'id' });

            if (error) {
                console.error('Error sub-áreas:', error);
                return res.status(500).json({ success: false, message: error.message });
            }

            // Borrar sub-áreas que ya no están en el lienzo
            const idsActuales = areas.map(a => a.id);
            await supabase
                .from('croquis_areas')
                .delete()
                .eq('area_id', area_id)
                .eq('restaurante_id', restaurante_id)
                .not('id', 'in', `(${idsActuales.map(i => `'${i}'`).join(',')})`);

        } else {
            await supabase
                .from('croquis_areas')
                .delete()
                .eq('area_id', area_id)
                .eq('restaurante_id', restaurante_id);
        }

        // ── GUARDAR MESAS ─────────────────────────────────────
        // mesas.id es BIGSERIAL en tu schema. Usamos id_externo (TEXT)
        // para identificar la mesa del frontend sin romper la PK autoincremental.
        if (mesas.length > 0) {
            for (const m of mesas) {
                // Buscar si ya existe por id_externo
                const { data: existente } = await supabase
                    .from('mesas')
                    .select('id, estado, bloqueada')
                    .eq('id_externo', m.id)
                    .eq('restaurante_id', restaurante_id)
                    .maybeSingle();

                const payload = {
                    id_externo:     m.id,
                    area_id:        parseInt(area_id),
                    restaurante_id,
                    numero:         String(m.numero || 'Mesa').trim().slice(0, 50),
                    forma:          ['rect-h','rect-v','circulo'].includes(m.forma) ? m.forma : 'rect-h',
                    capacidad:      Math.max(1, Math.min(30, parseInt(m.capacidad, 10) || 4)),
                    pos_x:          num(m.pos_x),
                    pos_y:          num(m.pos_y),
                    ancho:          num(m.ancho, 100, 40, 1000),
                    alto:           num(m.alto, 80, 40, 1000),
                    area_fig_id:    m.area_fig_id || null,
                };

                if (existente) {
                    // UPDATE — no tocar estado/bloqueada si la mesa está en uso
                    if (existente.estado === 'libre' && !existente.bloqueada) {
                        payload.estado    = 'libre';
                        payload.reservada = false;
                        payload.bloqueada = false;
                    }
                    const { error: updateMesaError } = await supabase
                        .from('mesas')
                        .update(payload)
                        .eq('id', existente.id)
                        .eq('restaurante_id', restaurante_id);
                    if (updateMesaError) throw updateMesaError;
                } else {
                    // INSERT nueva mesa
                    payload.estado    = 'libre';
                    payload.reservada = false;
                    payload.bloqueada = false;
                    const { error: insertMesaError } = await supabase.from('mesas').insert(payload);
                    if (insertMesaError) throw insertMesaError;
                }
            }

            // Borrar mesas eliminadas del lienzo (solo las que están libres)
            const idsExternos = mesas.map(m => m.id);
            await supabase
                .from('mesas')
                .delete()
                .eq('area_id', area_id)
                .eq('restaurante_id', restaurante_id)
                .eq('estado', 'libre')           // NUNCA borrar mesas ocupadas/reservadas
                .not('id_externo', 'in', `(${idsExternos.map(i => `'${i}'`).join(',')})`);

        } else {
            // Si quitaron todas las mesas, borrar solo las libres
            await supabase
                .from('mesas')
                .delete()
                .eq('area_id', area_id)
                .eq('restaurante_id', restaurante_id)
                .eq('estado', 'libre');
        }

        res.status(200).json({ success: true, message: 'Croquis guardado.' });

    } catch (err) {
        console.error('Error POST guardar-croquis:', err);
        res.status(500).json({ success: false, message: 'Error interno.' });
    }
});

// ============================================================
// POST /areas/mesa/estado  — Producción: cambiar estado
// ============================================================
router.post('/mesa/estado', async (req, res) => {
    try {
        const usuario = getUsuario(req);
        if (!usuario) return res.status(401).json({ success: false });

        const { mesa_id, estado, mesero_id, personas, hora_apertura, reserva_id } = req.body;

        const payload = { estado };
        if (mesero_id     !== undefined) payload.mesero_id         = mesero_id;
        if (personas      !== undefined) payload.personas_actuales = personas;
        if (hora_apertura !== undefined) payload.hora_apertura     = hora_apertura;
        if (reserva_id    !== undefined) payload.reserva_id        = reserva_id;

        // Al liberar mesa: limpiar todo
        if (estado === 'libre') {
            Object.assign(payload, {
                mesero_id: null, personas_actuales: 0,
                hora_apertura: null, reserva_id: null,
                bloqueada: false, nombre_reserva: null, hora_reserva: null,
            });
        }

        const { error } = await supabase
            .from('mesas')
            .update(payload)
            .eq('id', mesa_id)
            .eq('restaurante_id', usuario.restaurante_id);

        if (error) return res.status(400).json({ success: false, message: error.message });
        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ============================================================
// POST /areas/mesa/reservar  — Bloquear con reservación
// ============================================================
router.post('/mesa/reservar', async (req, res) => {
    try {
        const usuario = getUsuario(req);
        if (!usuario) return res.status(401).json({ success: false });

        const { mesa_id, reserva_id, nombre_cliente, hora_reserva } = req.body;

        const { error } = await supabase
            .from('mesas')
            .update({
                estado: 'reservada', reservada: true, bloqueada: true,
                reserva_id, nombre_reserva: nombre_cliente, hora_reserva,
            })
            .eq('id', mesa_id)
            .eq('restaurante_id', usuario.restaurante_id);

        if (error) return res.status(400).json({ success: false, message: error.message });
        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ============================================================
// POST /areas/mesa/desbloquear  — Solo admin / cajero / gerente
// ============================================================
router.post('/mesa/desbloquear', async (req, res) => {
    try {
        const usuario = getUsuario(req);
        if (!usuario) return res.status(401).json({ success: false });

        if (!['admin', 'cajero', 'gerente'].includes(usuario.rol)) {
            return res.status(403).json({ success: false, message: 'Sin permiso para desbloquear mesas.' });
        }

        const { mesa_id } = req.body;
        const { error } = await supabase
            .from('mesas')
            .update({
                estado: 'libre', reservada: false, bloqueada: false,
                reserva_id: null, nombre_reserva: null, hora_reserva: null,
            })
            .eq('id', mesa_id)
            .eq('restaurante_id', usuario.restaurante_id);

        if (error) return res.status(400).json({ success: false, message: error.message });
        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ success: false });
    }
});


// ============================================================
// POST /areas/guardar-posiciones — orden visual de tarjetas de áreas
// ============================================================
router.post('/guardar-posiciones', async (req, res) => {
    const usuario = getUsuario(req);
    if (!usuario) return res.status(401).json({ success: false, message: 'No autenticado.' });
    const posiciones = Array.isArray(req.body.posiciones) ? req.body.posiciones : [];
    try {
        for (const p of posiciones.slice(0, 200)) {
            const id = Number(p.id);
            const pos_x = Number(p.x ?? p.pos_x ?? 0);
            const pos_y = Number(p.y ?? p.pos_y ?? 0);
            if (!Number.isInteger(id) || !Number.isFinite(pos_x) || !Number.isFinite(pos_y)) continue;
            const { error } = await supabase
                .from('areas_restaurante')
                .update({ pos_x, pos_y, updated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('restaurante_id', usuario.restaurante_id);
            if (error) throw error;
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Error guardando posiciones:', err.message);
        res.status(500).json({ success: false, message: 'No se pudieron guardar las posiciones.' });
    }
});

// ============================================================
// DELETE /areas/eliminar/:id — no elimina áreas con mesas en uso
// ============================================================
router.delete('/eliminar/:id', async (req, res) => {
    const usuario = getUsuario(req);
    if (!usuario) return res.status(401).json({ success: false, message: 'No autenticado.' });
    const areaId = Number(req.params.id);
    if (!Number.isInteger(areaId)) return res.status(400).json({ success: false, message: 'Área inválida.' });
    try {
        const { count, error: countError } = await supabase
            .from('mesas')
            .select('id', { count: 'exact', head: true })
            .eq('restaurante_id', usuario.restaurante_id)
            .eq('area_id', areaId)
            .neq('estado', 'libre');
        if (countError) throw countError;
        if ((count || 0) > 0) {
            return res.status(409).json({ success: false, message: 'No puedes eliminar un área con mesas ocupadas/reservadas.' });
        }
        const { error } = await supabase
            .from('areas_restaurante')
            .delete()
            .eq('id', areaId)
            .eq('restaurante_id', usuario.restaurante_id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        console.error('Error eliminando área:', err.message);
        res.status(500).json({ success: false, message: 'No se pudo eliminar el área.' });
    }
});

module.exports = router;