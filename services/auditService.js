const { supabase } = require('../config/supabase');
const { getClientIp } = require('../utils/ip-access');

const TABLE = 'auditoria_eventos';
const MAX_DETAIL_BYTES = 12000;
const DEFAULT_PAGE_SIZE = 25;

let missingSchemaWarned = false;

function isMissingSchema(error) {
    return ['42P01', '42703', 'PGRST200', 'PGRST204', 'PGRST205'].includes(error?.code)
        || /relation|column|schema cache/i.test(error?.message || '');
}

function limitText(value, maxLength) {
    if (value === null || value === undefined || value === '') return null;
    return String(value).slice(0, maxLength);
}

function safeDetail(detail) {
    try {
        const raw = JSON.stringify(detail || {}, (_key, value) => (
            typeof value === 'bigint' ? value.toString() : value
        ));
        if (Buffer.byteLength(raw, 'utf8') <= MAX_DETAIL_BYTES) {
            return JSON.parse(raw);
        }
        return { truncado: true, resumen: raw.slice(0, Math.floor(MAX_DETAIL_BYTES / 2)) };
    } catch (_error) {
        return { truncado: true };
    }
}

/**
 * Registra un evento sin interrumpir la operación de negocio.
 * Si la migración de auditoría aún no se aplicó, devuelve false y no lanza.
 */
async function registrarAuditoria(req, { accion, entidad = null, entidadId = null, detalle = {} } = {}) {
    const usuario = req?.session?.usuario;
    if (!usuario?.restaurante_id || !accion) return false;

    const row = {
        restaurante_id: Number(usuario.restaurante_id),
        usuario_id: usuario.id ? Number(usuario.id) : null,
        usuario_nombre: limitText(usuario.nombre, 120),
        accion: limitText(accion, 80),
        entidad: limitText(entidad, 60),
        entidad_id: limitText(entidadId, 80),
        detalle: safeDetail(detalle),
        ip: limitText(getClientIp(req), 80),
        user_agent: limitText(typeof req.get === 'function' ? req.get('user-agent') : req.headers?.['user-agent'], 300)
    };

    try {
        const { error } = await supabase.from(TABLE).insert(row);
        if (error) {
            if (!isMissingSchema(error) && !missingSchemaWarned) {
                console.error('No se pudo registrar auditoría:', error.message);
                missingSchemaWarned = true;
            }
            return false;
        }
        missingSchemaWarned = false;
        return true;
    } catch (error) {
        if (!isMissingSchema(error) && !missingSchemaWarned) {
            console.error('No se pudo registrar auditoría:', error.message);
            missingSchemaWarned = true;
        }
        return false;
    }
}

function cleanSearch(value) {
    return String(value || '').trim().replace(/[%_\\]/g, '').slice(0, 80);
}

async function listarAuditoria(restauranteId, filtros = {}) {
    const page = Math.max(1, Number.parseInt(filtros.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(10, Number.parseInt(filtros.pageSize, 10) || DEFAULT_PAGE_SIZE));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
        .from(TABLE)
        .select('*', { count: 'exact' })
        .eq('restaurante_id', restauranteId);

    if (filtros.accion) query = query.eq('accion', filtros.accion);
    if (filtros.entidad) query = query.eq('entidad', filtros.entidad);
    if (filtros.usuario) query = query.ilike('usuario_nombre', `%${cleanSearch(filtros.usuario)}%`);
    if (filtros.desde) query = query.gte('creado_en', filtros.desde);
    if (filtros.hasta) query = query.lte('creado_en', filtros.hasta);

    const { data, error, count } = await query
        .order('creado_en', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);

    if (error) throw error;

    const total = Number(count || 0);
    return {
        eventos: data || [],
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize))
    };
}

async function getAuditoriaResumen(restauranteId) {
    const desde24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [totalResult, recientesResult] = await Promise.all([
        supabase.from(TABLE).select('id', { count: 'exact', head: true }).eq('restaurante_id', restauranteId),
        supabase.from(TABLE).select('id', { count: 'exact', head: true })
            .eq('restaurante_id', restauranteId)
            .gte('creado_en', desde24h)
    ]);

    if (totalResult.error) throw totalResult.error;
    if (recientesResult.error) throw recientesResult.error;

    return {
        total: Number(totalResult.count || 0),
        ultimas24h: Number(recientesResult.count || 0)
    };
}

module.exports = {
    registrarAuditoria,
    listarAuditoria,
    getAuditoriaResumen,
    isMissingSchema,
    safeDetail
};
