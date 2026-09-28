const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { verificarSesion } = require('../middlewares/authMiddleware');
const { normalizeRole } = require('../middlewares/access');

const ADMIN_KDS = new Set(['admin', 'gerente', 'cajero']);

function canSeeStation(role, station) {
    role = normalizeRole(role);
    return ADMIN_KDS.has(role) || role === station;
}

function stationCategory(station) {
    return station === 'cocina' ? 'Cocina' : 'Bar';
}

async function getQueue(restauranteId, station) {
    const { data, error } = await supabase
        .from('pedido_items')
        .select(`
            id, pedido_id, cantidad, nota, estado, enviado_at, preparado_at, listo_at, created_at,
            pedidos ( id, mesa_id, estado, mesas ( numero ) ),
            productos ( id, nombre, categoria )
        `)
        .eq('restaurante_id', restauranteId)
        .in('estado', ['enviado', 'preparando', 'listo'])
        .order('enviado_at', { ascending: true });
    if (error) throw error;
    const categoria = stationCategory(station).toLowerCase();
    return (data || []).filter(item => String(item.productos?.categoria || '').toLowerCase() === categoria);
}

async function renderStation(req, res, station) {
    const role = normalizeRole(req.session.usuario.rol);
    if (!canSeeStation(role, station)) {
        return res.status(403).render('error', { error: { message: `No tienes permiso para acceder al monitor de ${station}.` } });
    }
    try {
        const items = await getQueue(req.session.usuario.restaurante_id, station);
        res.render(station === 'cocina' ? 'kds_cocina' : 'kds_bar', {
            usuario: req.session.usuario,
            itemsIniciales: JSON.stringify(items),
            station
        });
    } catch (error) {
        console.error(`Error KDS ${station}:`, error);
        res.status(500).render('error', { error: { message: 'No se pudo cargar la cola KDS.' } });
    }
}

router.get('/cocina', verificarSesion, (req, res) => renderStation(req, res, 'cocina'));
router.get('/bar', verificarSesion, (req, res) => renderStation(req, res, 'bar'));

// Canal SSE autenticado con la misma sesión Express del POS.
// Evita exponer Supabase al navegador y mantiene el aislamiento por restaurante.
router.get('/:station(cocina|bar)/events', verificarSesion, async (req, res) => {
    const station = req.params.station;
    if (!canSeeStation(req.session.usuario.rol, station)) return res.status(403).end();
    const restauranteId = req.session.usuario.restaurante_id;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write('retry: 3000\n\n');

    let lastPayload = '';
    let closed = false;
    const push = async () => {
        if (closed) return;
        try {
            const items = await getQueue(restauranteId, station);
            const payload = JSON.stringify(items);
            if (payload !== lastPayload) {
                lastPayload = payload;
                res.write(`event: queue\ndata: ${payload}\n\n`);
            } else {
                res.write(`: heartbeat ${Date.now()}\n\n`);
            }
        } catch (error) {
            console.error('Error SSE KDS:', error.message);
            res.write(`event: server-error\ndata: ${JSON.stringify({ message: 'No se pudo actualizar la cola.' })}\n\n`);
        }
    };

    await push();
    const timer = setInterval(push, 2500);
    req.on('close', () => { closed = true; clearInterval(timer); });
});

router.get('/:station(cocina|bar)/cola', verificarSesion, async (req, res) => {
    const station = req.params.station;
    if (!canSeeStation(req.session.usuario.rol, station)) return res.status(403).json({ error: 'No autorizado.' });
    try {
        res.json(await getQueue(req.session.usuario.restaurante_id, station));
    } catch (error) {
        console.error('Error obteniendo cola KDS:', error);
        res.status(500).json({ error: 'No se pudo obtener la cola.' });
    }
});

async function getItemStation(itemId, restauranteId) {
    const { data, error } = await supabase
        .from('pedido_items')
        .select('id, estado, productos(categoria)')
        .eq('id', itemId)
        .eq('restaurante_id', restauranteId)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const cat = String(data.productos?.categoria || '').toLowerCase();
    return { item: data, station: cat === 'cocina' ? 'cocina' : cat === 'bar' ? 'bar' : null };
}

router.put('/:itemId/estado', verificarSesion, async (req, res) => {
    const restauranteId = req.session.usuario.restaurante_id;
    const estado = String(req.body.estado || '').toLowerCase();
    if (!['preparando', 'listo'].includes(estado)) return res.status(400).json({ error: 'Estado inválido.' });
    try {
        const info = await getItemStation(req.params.itemId, restauranteId);
        if (!info?.station) return res.status(404).json({ error: 'Item KDS no encontrado.' });
        if (!canSeeStation(req.session.usuario.rol, info.station)) return res.status(403).json({ error: 'No autorizado para esta estación.' });

        const transitions = { enviado: ['preparando'], preparando: ['listo'], listo: [] };
        if (!(transitions[info.item.estado] || []).includes(estado)) {
            return res.status(409).json({ error: `Transición inválida: ${info.item.estado} → ${estado}` });
        }

        const { data, error } = await supabase.rpc('pos_transition_kds', {
            p_restaurante_id: Number(restauranteId),
            p_item_id: Number(req.params.itemId),
            p_station: info.station,
            p_next_state: estado
        });
        if (error) throw error;
        if (!data) return res.status(409).json({ error: 'La comanda cambió de estado; actualiza la cola.' });
        res.json({ success: true, item: data });
    } catch (error) {
        console.error('Error actualizando KDS:', error);
        res.status(500).json({ error: 'No se pudo actualizar la comanda.' });
    }
});

router.put('/:itemId/finalizar', verificarSesion, async (req, res) => {
    const restauranteId = req.session.usuario.restaurante_id;
    try {
        const info = await getItemStation(req.params.itemId, restauranteId);
        if (!info?.station) return res.status(404).json({ error: 'Item KDS no encontrado.' });
        if (!canSeeStation(req.session.usuario.rol, info.station)) return res.status(403).json({ error: 'No autorizado para esta estación.' });
        if (info.item.estado !== 'listo') return res.status(409).json({ error: 'La comanda debe estar lista antes de finalizar.' });

        const { data, error } = await supabase.rpc('pos_transition_kds', {
            p_restaurante_id: Number(restauranteId),
            p_item_id: Number(req.params.itemId),
            p_station: info.station,
            p_next_state: 'servido'
        });
        if (error) throw error;
        if (!data) return res.status(409).json({ error: 'La comanda cambió de estado.' });
        res.json({ success: true, item: data });
    } catch (error) {
        console.error('Error finalizando KDS:', error);
        res.status(500).json({ error: 'No se pudo finalizar la comanda.' });
    }
});

module.exports = router;
