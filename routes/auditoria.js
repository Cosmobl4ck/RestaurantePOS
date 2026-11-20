const express = require('express');
const excel = require('exceljs');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { dateInTimeZone } = require('../utils/business-time');
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

function parseAsistRange(query = {}, timeZone) {
    const hoy = dateInTimeZone(timeZone);
    const hasta = DATE_RE.test(String(query.asist_hasta || '')) ? String(query.asist_hasta) : hoy;
    let desde = DATE_RE.test(String(query.asist_desde || '')) ? String(query.asist_desde) : null;
    if (!desde) {
        const inicio = new Date(`${hasta}T00:00:00Z`);
        inicio.setUTCDate(inicio.getUTCDate() - 6);
        desde = inicio.toISOString().slice(0, 10);
    }
    if (desde > hasta) {
        const temporal = desde;
        desde = hasta;
        hasta = temporal;
    }
    return { desde, hasta };
}

async function loadAsistencia(restauranteId, desde, hasta, timeZone, empleados = []) {
    const { data, error } = await supabase.rpc('asistencia_reporte', {
        p_restaurante_id: Number(restauranteId),
        p_desde: desde,
        p_hasta: hasta
    });
    if (error) throw error;

    const seleccionados = new Set((empleados || [])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0));
    const dataFiltrada = seleccionados.size
        ? (data || []).filter((row) => seleccionados.has(Number(row.empleado_id)))
        : (data || []);

    const fmtHora = new Intl.DateTimeFormat('es-SV', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit'
    });

    const rows = dataFiltrada.map((row) => {
        const entrada = row.entrada ? new Date(row.entrada) : null;
        const salida = row.salida ? new Date(row.salida) : null;
        return {
            ...row,
            entrada_texto: entrada && !Number.isNaN(entrada.getTime()) ? fmtHora.format(entrada) : '—',
            salida_texto: salida && !Number.isNaN(salida.getTime()) ? fmtHora.format(salida) : '—',
            horas_texto: row.horas == null ? '—' : Number(row.horas).toFixed(2)
        };
    });

    const totalHoras = rows.reduce((sum, row) => sum + (Number(row.horas) || 0), 0);
    return {
        rows,
        resumen: {
            totalHoras: Math.round(totalHoras * 100) / 100,
            entradas: rows.filter((row) => row.entrada_texto !== '—').length,
            salidas: rows.filter((row) => row.salida_texto !== '—').length,
            empleados: new Set(rows.map((row) => String(row.empleado_id))).size
        }
    };
}

function parseAsistEmpleados(query = {}) {
    const raw = query.asist_empleados;
    const values = Array.isArray(raw) ? raw : String(raw || '').split(',');
    return values
        .map((value) => Number(String(value).trim()))
        .filter((value) => Number.isInteger(value) && value > 0);
}

router.get('/', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');

    const restauranteId = req.session.usuario.restaurante_id;
    const filtros = parseFilters(req.query);
    const asistSeleccionados = parseAsistEmpleados(req.query);
    const activeTab = req.query.tab === 'asistencia' ? 'asistencia' : 'eventos';
    let empleadosFiltro = [];
    let asistencia = { rows: [], resumen: { totalHoras: 0, entradas: 0, salidas: 0, empleados: 0 } };
    let asistDesde = '';
    let asistHasta = '';

    try {
        const { data: tenant, error: tenantError } = await supabase
            .from('restaurantes')
            .select('timezone')
            .eq('id', restauranteId)
            .maybeSingle();

        if (tenantError) throw tenantError;

        const timeZone = tenant?.timezone || 'America/El_Salvador';
        const { data: empleadosData } = await supabase
            .from('usuarios')
            .select('id, nombre, rol')
            .eq('restaurante_id', restauranteId)
            .in('rol', ['mesero', 'cajero', 'cocina', 'bar'])
            .order('rol', { ascending: true })
            .order('nombre', { ascending: true });
        empleadosFiltro = empleadosData || [];

        const asistRango = parseAsistRange(req.query, timeZone);
        asistDesde = asistRango.desde;
        asistHasta = asistRango.hasta;
        try {
            asistencia = await loadAsistencia(restauranteId, asistDesde, asistHasta, timeZone, asistSeleccionados);
        } catch (asistError) {
            console.error('No se pudo cargar asistencia:', asistError.message);
        }
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
            asistencia,
            asistDesde,
            asistHasta,
            empleadosFiltro,
            asistSeleccionados,
            activeTab,
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
                asistencia,
                asistDesde,
                asistHasta,
                empleadosFiltro,
                asistSeleccionados,
                activeTab,
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

// Exporta el reporte de asistencia a Excel.
router.get('/asistencia/exportar', async (req, res) => {
    const restauranteId = req.session.usuario.restaurante_id;

    try {
        const { data: tenant } = await supabase
            .from('restaurantes')
            .select('timezone')
            .eq('id', restauranteId)
            .maybeSingle();
        const timeZone = tenant?.timezone || 'America/El_Salvador';
        const rango = parseAsistRange(req.query, timeZone);
        const seleccionados = parseAsistEmpleados(req.query);
        const { rows } = await loadAsistencia(restauranteId, rango.desde, rango.hasta, timeZone, seleccionados);

        const workbook = new excel.Workbook();
        workbook.creator = 'MarrocosPOS';

        const detalle = workbook.addWorksheet('Asistencia');
        detalle.columns = [
            { header: 'Empleado', key: 'empleado', width: 24 },
            { header: 'Rol', key: 'rol', width: 14 },
            { header: 'Día', key: 'dia', width: 12 },
            { header: 'Entrada', key: 'entrada', width: 10 },
            { header: 'Salida', key: 'salida', width: 10 },
            { header: 'Horas', key: 'horas', width: 10 },
            { header: 'IP entrada', key: 'ip_entrada', width: 18 },
            { header: 'IP salida', key: 'ip_salida', width: 18 }
        ];
        detalle.getRow(1).font = { bold: true };
        detalle.views = [{ state: 'frozen', ySplit: 1 }];

        rows.forEach((row) => {
            detalle.addRow({
                empleado: row.empleado,
                rol: row.rol,
                dia: row.dia,
                entrada: row.entrada_texto,
                salida: row.salida_texto,
                horas: row.horas == null ? '' : Number(row.horas),
                ip_entrada: row.ip_entrada || '',
                ip_salida: row.ip_salida || ''
            });
        });

        const totalHoras = rows.reduce((sum, row) => sum + (Number(row.horas) || 0), 0);
        const totalRow = detalle.addRow({ empleado: 'TOTAL', horas: Math.round(totalHoras * 100) / 100 });
        totalRow.font = { bold: true };

        const resumen = new Map();
        rows.forEach((row) => {
            const key = String(row.empleado_id);
            if (!resumen.has(key)) {
                resumen.set(key, {
                    empleado: row.empleado,
                    rol: row.rol,
                    dias: 0,
                    entradas: 0,
                    salidas: 0,
                    horas: 0
                });
            }
            const item = resumen.get(key);
            item.dias += 1;
            if (row.entrada_texto !== '—') item.entradas += 1;
            if (row.salida_texto !== '—') item.salidas += 1;
            item.horas += Number(row.horas) || 0;
        });

        const hojaResumen = workbook.addWorksheet('Resumen por empleado');
        hojaResumen.columns = [
            { header: 'Empleado', key: 'empleado', width: 24 },
            { header: 'Rol', key: 'rol', width: 14 },
            { header: 'Días', key: 'dias', width: 10 },
            { header: 'Entradas', key: 'entradas', width: 10 },
            { header: 'Salidas', key: 'salidas', width: 10 },
            { header: 'Horas totales', key: 'horas', width: 14 }
        ];
        hojaResumen.getRow(1).font = { bold: true };
        resumen.forEach((item) => {
            hojaResumen.addRow({ ...item, horas: Math.round(item.horas * 100) / 100 });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Asistencia_${rango.desde}_${rango.hasta}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exportando asistencia:', error.message);
        res.status(500).send('No se pudo generar el Excel de asistencia.');
    }
});

module.exports = router;
