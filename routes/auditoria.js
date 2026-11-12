const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const {
    listarAuditoria,
    getAuditoriaResumen,
    isMissingSchema
} = require('../services/auditService');
const {
    AUDIT_ACTION_GROUPS,
    getAuditActionLabel,
    getAuditActionTone,
    isAuditAction
} = require('../config/audit');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function getTimeZoneOffset(timeZone, date = new Date()) {
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: timeZone || 'America/El_Salvador',
            timeZoneName: 'longOffset'
        }).formatToParts(date);
        const name = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT';
        if (name === 'GMT' || name === 'UTC') return '+00:00';
        const match = name.match(/^GMT([+-])(\d{2}):?(\d{2})?$/);
        return match ? `${match[1]}${match[2]}:${match[3] || '00'}` : '+00:00';
    } catch (_error) {
        return '+00:00';
    }
}

function toIsoBoundary(value, endOfDay, timeZone) {
    if (!DATE_RE.test(String(value || ''))) return null;
    const offset = getTimeZoneOffset(timeZone);
    return `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}${offset}`;
}

function cleanText(value, maxLength) {
    return String(value || '')
        .trim()
        .replace(/[^\p{L}\p{N}\s._-]/gu, '')
        .slice(0, maxLength);
}

function parseFilters(query = {}) {
    return {
        accion: isAuditAction(query.accion) ? String(query.accion) : '',
        entidad: cleanText(query.entidad, 60).toLowerCase(),
        usuario: cleanText(query.usuario, 50),
        desde: DATE_RE.test(String(query.desde || '')) ? String(query.desde) : '',
        hasta: DATE_RE.test(String(query.hasta || '')) ? String(query.hasta) : '',
        page: Math.max(1, Number.parseInt(query.page, 10) || 1)
    };
}

function buildPageUrl(filtros, page) {
    const params = new URLSearchParams();
    if (filtros.accion) params.set('accion', filtros.accion);
    if (filtros.entidad) params.set('entidad', filtros.entidad);
    if (filtros.usuario) params.set('usuario', filtros.usuario);
    if (filtros.desde) params.set('desde', filtros.desde);
    if (filtros.hasta) params.set('hasta', filtros.hasta);
    if (page > 1) params.set('page', String(page));
    const query = params.toString();
    return `/auditoria${query ? `?${query}` : ''}`;
}

router.get('/', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');

    const restauranteId = req.session.usuario.restaurante_id;
    const filtros = parseFilters(req.query);

    try {
        const { data: tenant, error: tenantError } = await supabase
            .from('restaurantes')
            .select('timezone')
            .eq('id', restauranteId)
            .maybeSingle();

        if (tenantError) throw tenantError;

        const timeZone = tenant?.timezone || 'America/El_Salvador';
        const dbFilters = {
            accion: filtros.accion,
            entidad: filtros.entidad,
            usuario: filtros.usuario,
            desde: toIsoBoundary(filtros.desde, false, timeZone),
            hasta: toIsoBoundary(filtros.hasta, true, timeZone),
            page: filtros.page,
            pageSize: 25
        };

        const [pagina, resumen] = await Promise.all([
            listarAuditoria(restauranteId, dbFilters),
            getAuditoriaResumen(restauranteId)
        ]);

        const formatter = new Intl.DateTimeFormat('es-SV', {
            timeZone,
            dateStyle: 'medium',
            timeStyle: 'short'
        });

        const eventos = pagina.eventos.map((evento) => {
            const fecha = evento.creado_en ? new Date(evento.creado_en) : null;
            return {
                ...evento,
                creado_en_texto: fecha && !Number.isNaN(fecha.getTime()) ? formatter.format(fecha) : '—',
                accion_label: getAuditActionLabel(evento.accion),
                accion_tone: getAuditActionTone(evento.accion)
            };
        });

        return res.render('auditoria', {
            eventos,
            resumen,
            total: pagina.total,
            page: pagina.page,
            totalPages: pagina.totalPages,
            filtros,
            acciones: AUDIT_ACTION_GROUPS,
            prevUrl: pagina.page > 1 ? buildPageUrl(filtros, pagina.page - 1) : null,
            nextUrl: pagina.page < pagina.totalPages ? buildPageUrl(filtros, pagina.page + 1) : null,
            migrationMissing: false,
            usuario: req.session.usuario
        });
    } catch (error) {
        if (isMissingSchema(error)) {
            return res.render('auditoria', {
                eventos: [],
                resumen: { total: 0, ultimas24h: 0 },
                total: 0,
                page: 1,
                totalPages: 1,
                filtros,
                acciones: AUDIT_ACTION_GROUPS,
                prevUrl: null,
                nextUrl: null,
                migrationMissing: true,
                usuario: req.session.usuario
            });
        }

        console.error('Error cargando auditoría:', error.message);
        return res.status(500).render('error', {
            error: { message: 'No se pudo cargar la auditoría.' },
            usuario: req.session.usuario
        });
    }
});

module.exports = router;
