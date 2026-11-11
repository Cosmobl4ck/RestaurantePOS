// KDS seguro: actualización en vivo mediante Server-Sent Events autenticados por Express.
const TIPO_MONITOR = window.tipoMonitor;
let comandas = {};
let eventSource = null;
let fallbackTimer = null;
const ALERTA_MINUTOS = 2;
const PREP_POR_DEFECTO = { cocina: 15, bar: 10 };

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function setConnectionStatus(text, live) {
    const el = document.getElementById('realtime-status');
    if (!el) return;
    el.textContent = text;
    el.className = `kds-status ${live ? 'status-live' : 'status-offline'}`;
}

setInterval(() => {
    const reloj = document.getElementById('reloj');
    if (reloj) reloj.textContent = new Date().toLocaleTimeString('es-SV');
}, 1000);

function minutosDesde(isoStr) {
    const fecha = parseDbDate(isoStr);
    if (!fecha || Number.isNaN(fecha.getTime())) return 0;
    return Math.max(0, Math.floor((Date.now() - fecha.getTime()) / 60000));
}
function parseDbDate(isoStr) {
    if (!isoStr) return null;
    const value = String(isoStr);
    // Las columnas timestamp de la BD guardan UTC sin zona. Agregar Z evita
    // que el navegador las interprete como hora local y desfase el KDS.
    return new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`);
}
function horaCorta(isoStr) {
    const fecha = parseDbDate(isoStr);
    if (!fecha || Number.isNaN(fecha.getTime())) return '--:--';
    return fecha.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
}
function toast(msg) {
    const el = document.createElement('div');
    el.className = 'kds-toast';
    el.textContent = msg;
    document.getElementById('toast-container')?.appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

function itemsToComandas(items) {
    const mapa = {};
    (Array.isArray(items) ? items : []).forEach(it => {
        if (!it.pedidos) return;
        const pedidoId = Number(it.pedidos.id);
        const mesa = it.pedidos.mesas?.numero || `#${pedidoId}`;
        if (!mapa[pedidoId]) mapa[pedidoId] = { pedidoId, mesa, hora: it.enviado_at || it.created_at, items: [] };
        mapa[pedidoId].items.push({
            id: Number(it.id),
            nombre: it.productos?.nombre || 'Producto',
            cantidad: it.cantidad,
            nota: it.nota,
            estado: it.estado,
            tiempoPreparacion: Number(it.tiempo_preparacion_minutos) > 0
                ? Number(it.tiempo_preparacion_minutos)
                : null,
            alergenos: Array.isArray(it.alergenos)
                ? it.alergenos.map((alergeno) => String(alergeno)).filter(Boolean)
                : [],
            alergiaAviso: String(it.alergia_aviso || '').trim(),
            enviadoAt: it.enviado_at || it.created_at
        });
    });
    return mapa;
}
function estadoGlobal(items) {
    if (items.length && items.every(i => i.estado === 'listo')) return 'listo';
    if (items.some(i => i.estado === 'preparando' || i.estado === 'listo')) return 'preparando';
    return 'enviado';
}

function minutosPreparacion(item) {
    return item.tiempoPreparacion || PREP_POR_DEFECTO[TIPO_MONITOR] || 15;
}

// La tarjeta usa el ítem activo con la menor holgura. Así, si un pedido
// mezcla un plato de 8 min con uno de 20 min, avisa por el más urgente.
function estadoTiempo(pedido) {
    const activos = pedido.items.filter(item => item.estado === 'enviado' || item.estado === 'preparando');
    const mins = minutosDesde(pedido.hora);

    if (!activos.length) {
        return { critico: false, mins, restante: null };
    }

    let restante = null;
    activos.forEach((item) => {
        const base = parseDbDate(item.enviadoAt || pedido.hora);
        if (!base || Number.isNaN(base.getTime())) return;
        const preparacion = minutosPreparacion(item);
        const faltan = Math.ceil((base.getTime() + preparacion * 60000 - Date.now()) / 60000);
        if (restante === null || faltan < restante) restante = faltan;
    });

    return {
        critico: restante !== null && restante <= ALERTA_MINUTOS,
        mins,
        restante
    };
}

function textoBadge(tiempo) {
    if (tiempo.restante === null) return `⏱ ${tiempo.mins} min`;
    if (tiempo.critico) {
        return tiempo.restante > 0
            ? `⚠ ${tiempo.restante} min`
            : `⚠ ${Math.abs(tiempo.restante)} min tarde`;
    }
    return `⏱ ${tiempo.mins} min`;
}

function tieneAlertaAlergenos(pedido) {
    return pedido.items.some(item => item.alergiaAviso || item.alergenos.length > 0);
}

function renderGrid() {
    const grid = document.getElementById('grid-comandas');
    if (!grid) return;
    const pedidos = Object.values(comandas).sort((a,b) => parseDbDate(a.hora)-parseDbDate(b.hora));
    if (!pedidos.length) {
        grid.innerHTML = '<div class="empty-state"><i class="bi bi-check2-circle"></i><p>Sin comandas pendientes</p></div>';
        return;
    }
    const colorClass = TIPO_MONITOR === 'cocina' ? 'cocina' : 'bar';
    const tipoLabel = TIPO_MONITOR === 'cocina' ? 'Comida' : 'Bebida';
    grid.innerHTML = pedidos.map(p => {
        const estado = estadoGlobal(p.items);
        const tiempo = estadoTiempo(p);
        const alertaAlergenos = tieneAlertaAlergenos(p);
        const clases = [
            colorClass,
            estado,
            alertaAlergenos ? 'alerta-alergenos' : '',
            tiempo.critico ? 'tiempo-critico' : ''
        ].filter(Boolean).join(' ');
        const itemsHTML = p.items.map(it => {
            const nota = String(it.nota || '').trim();
            const aviso = it.alergiaAviso;
            const notaAlergia = /alergia/i.test(nota);
            return `
            <div class="comanda-item">
                <span class="item-qty">${escapeHtml(it.cantidad)}</span>
                <div class="item-contenido">
                    <div class="item-nombre">${escapeHtml(it.nombre)}</div>
                    ${it.alergenos.length ? `<div class="item-alergenos"><i class="bi bi-exclamation-triangle-fill"></i> Contiene: ${it.alergenos.map(escapeHtml).join(', ')}</div>` : ''}
                    ${aviso ? `<div class="item-alergia-aviso"><i class="bi bi-exclamation-octagon-fill"></i> ALERGIA: ${escapeHtml(aviso)}</div>` : ''}
                    ${nota && (!aviso || !nota.includes(aviso)) ? `<div class="item-nota ${notaAlergia ? 'alerta' : ''}">📝 ${escapeHtml(nota)}</div>` : ''}
                    ${it.tiempoPreparacion ? `<div class="item-tiempo"><i class="bi bi-clock"></i> ≈ ${it.tiempoPreparacion} min</div>` : ''}
                </div>
            </div>`;
        }).join('');
        const acciones = estado === 'enviado'
            ? `<button class="btn-kds btn-preparar" onclick="avanzarPedido(${p.pedidoId},'preparando')"><i class="bi bi-play-fill"></i> Preparando</button>`
            : estado === 'preparando'
            ? `<button class="btn-kds btn-listo" onclick="avanzarPedido(${p.pedidoId},'listo')"><i class="bi bi-check-lg"></i> Listo</button>`
            : `<button class="btn-kds btn-finalizar" onclick="finalizarPedido(${p.pedidoId})"><i class="bi bi-bell"></i> ${tipoLabel} lista</button>`;
        const alergiaBadge = alertaAlergenos
            ? '<span class="alergia-badge"><i class="bi bi-exclamation-octagon-fill"></i> Alérgenos</span>'
            : '';
        return `<div class="comanda-card ${clases}" data-pedido="${p.pedidoId}">
            <div class="comanda-header"><div><div class="comanda-mesa">${escapeHtml(p.mesa)}</div><div class="comanda-hora">${horaCorta(p.hora)}</div></div>
            <div class="comanda-badges">${alergiaBadge}<span class="tiempo-badge ${tiempo.critico ? 'urgente' : ''}">${textoBadge(tiempo)}</span></div></div>
            <div class="comanda-items">${itemsHTML}</div><div class="comanda-actions">${acciones}</div></div>`;
    }).join('');
}

// El SSE solo emite eventos cuando cambia la cola; este intervalo mantiene
// actualizado el tiempo restante y dispara el aviso a los 2 minutos.
setInterval(() => {
    document.querySelectorAll('.comanda-card').forEach(card => {
        const pedido = comandas[card.dataset.pedido];
        if (!pedido) return;
        const tiempo = estadoTiempo(pedido);
        const badge = card.querySelector('.tiempo-badge');
        if (badge) {
            badge.textContent = textoBadge(tiempo);
            badge.classList.toggle('urgente', tiempo.critico);
        }
        card.classList.toggle('tiempo-critico', tiempo.critico);
    });
}, 1000);

async function requestJson(url, options) {
    const resp = await fetch(url, options);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Operación no disponible.');
    return data;
}
async function avanzarPedido(pedidoId, nuevoEstado) {
    const pedido = comandas[pedidoId];
    if (!pedido) return;
    const items = pedido.items.filter(it => nuevoEstado === 'preparando' ? it.estado === 'enviado' : it.estado === 'preparando');
    try {
        for (const item of items) await requestJson(`/kds/${item.id}/estado`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({estado:nuevoEstado}) });
        await cargarInicial();
    } catch (e) { toast(e.message); }
}
async function finalizarPedido(pedidoId) {
    const pedido = comandas[pedidoId];
    if (!pedido) return;
    try {
        for (const item of pedido.items.filter(it => it.estado === 'listo')) await requestJson(`/kds/${item.id}/finalizar`, { method:'PUT' });
        toast(`${pedido.mesa}: ${TIPO_MONITOR === 'cocina' ? 'Comida' : 'Bebida'} lista para retirar`);
        await cargarInicial();
    } catch (e) { toast(e.message); }
}

async function cargarInicial() {
    const items = await requestJson(`/kds/${TIPO_MONITOR}/cola`);
    comandas = itemsToComandas(items);
    renderGrid();
}

function iniciarSSE() {
    if (!window.EventSource) return iniciarFallback();
    eventSource?.close();
    eventSource = new EventSource(`/kds/${TIPO_MONITOR}/events`);
    eventSource.addEventListener('queue', ev => {
        try { comandas = itemsToComandas(JSON.parse(ev.data)); renderGrid(); setConnectionStatus('En vivo', true); }
        catch (_) { setConnectionStatus('Actualizando...', false); }
    });
    eventSource.addEventListener('server-error', () => setConnectionStatus('Reconectando...', false));
    eventSource.onopen = () => setConnectionStatus('En vivo', true);
    eventSource.onerror = () => setConnectionStatus('Reconectando...', false);
}
function iniciarFallback() {
    setConnectionStatus('Actualización periódica', false);
    clearInterval(fallbackTimer);
    fallbackTimer = setInterval(() => cargarInicial().catch(() => {}), 10000);
}

document.addEventListener('DOMContentLoaded', async () => {
    try { await cargarInicial(); } catch (e) { toast(e.message); }
    iniciarSSE();
});
window.addEventListener('beforeunload', () => eventSource?.close());
