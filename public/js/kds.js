// KDS seguro: actualización en vivo mediante Server-Sent Events autenticados por Express.
const TIPO_MONITOR = window.tipoMonitor;
let comandas = {};
let eventSource = null;
let fallbackTimer = null;

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
    if (!isoStr) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(isoStr).getTime()) / 60000));
}
function horaCorta(isoStr) {
    if (!isoStr) return '--:--';
    return new Date(isoStr).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
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
            id: Number(it.id), nombre: it.productos?.nombre || 'Producto', cantidad: it.cantidad,
            nota: it.nota, estado: it.estado
        });
    });
    return mapa;
}
function estadoGlobal(items) {
    if (items.length && items.every(i => i.estado === 'listo')) return 'listo';
    if (items.some(i => i.estado === 'preparando' || i.estado === 'listo')) return 'preparando';
    return 'enviado';
}

function renderGrid() {
    const grid = document.getElementById('grid-comandas');
    if (!grid) return;
    const pedidos = Object.values(comandas).sort((a,b) => new Date(a.hora)-new Date(b.hora));
    if (!pedidos.length) {
        grid.innerHTML = '<div class="empty-state"><i class="bi bi-check2-circle"></i><p>Sin comandas pendientes</p></div>';
        return;
    }
    const colorClass = TIPO_MONITOR === 'cocina' ? 'cocina' : 'bar';
    const tipoLabel = TIPO_MONITOR === 'cocina' ? 'Comida' : 'Bebida';
    grid.innerHTML = pedidos.map(p => {
        const estado = estadoGlobal(p.items);
        const mins = minutosDesde(p.hora);
        const urgente = TIPO_MONITOR === 'cocina' ? mins >= 15 : mins >= 10;
        const itemsHTML = p.items.map(it => `
            <div class="comanda-item">
                <span class="item-qty">${escapeHtml(it.cantidad)}</span>
                <div><div class="item-nombre">${escapeHtml(it.nombre)}</div>
                ${it.nota ? `<div class="item-nota">📝 ${escapeHtml(it.nota)}</div>` : ''}</div>
            </div>`).join('');
        const acciones = estado === 'enviado'
            ? `<button class="btn-kds btn-preparar" onclick="avanzarPedido(${p.pedidoId},'preparando')"><i class="bi bi-play-fill"></i> Preparando</button>`
            : estado === 'preparando'
            ? `<button class="btn-kds btn-listo" onclick="avanzarPedido(${p.pedidoId},'listo')"><i class="bi bi-check-lg"></i> Listo</button>`
            : `<button class="btn-kds btn-finalizar" onclick="finalizarPedido(${p.pedidoId})"><i class="bi bi-bell"></i> ${tipoLabel} lista</button>`;
        return `<div class="comanda-card ${colorClass} ${estado}" data-pedido="${p.pedidoId}">
            <div class="comanda-header"><div><div class="comanda-mesa">${escapeHtml(p.mesa)}</div><div class="comanda-hora">${horaCorta(p.hora)}</div></div>
            <span class="tiempo-badge ${urgente ? 'urgente' : ''}">${mins} min</span></div>
            <div class="comanda-items">${itemsHTML}</div><div class="comanda-actions">${acciones}</div></div>`;
    }).join('');
}

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
