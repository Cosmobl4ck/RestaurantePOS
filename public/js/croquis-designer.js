// ============================================================
// PETRONAS SYSTEM — CROQUIS DESIGNER v2.0
// Fase 1: Diseño de Áreas | Fase 2: Diseño de Mesas por Área
// ============================================================

// --- ESTADO GLOBAL ---
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

const STATE = {
    fase: 'areas',           // 'areas' | 'mesas'
    areaActiva: null,        // objeto área seleccionada
    figuras: [],             // [{id, tipo, x, y, w, h, nombre, el}]
    mesasPorArea: {},        // { areaId: [{...}] }
    contadorFiguras: 1,
    contadorMesas: 1,
    snap: 10,
    dragging: null,
    resizing: null,
    selected: null,
    offsetX: 0, offsetY: 0,
    resizeHandle: null,
    resizeStart: null,
};

// ============================================================
// INICIALIZACIÓN
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    inicializarFaseAreas();
    cargarMesasGuardadas();
    setupKeyboard();
});

function snapVal(v) {
    return Math.round(v / STATE.snap) * STATE.snap;
}

// ============================================================
// FASE 1: DISEÑO DE ÁREAS
// ============================================================
function inicializarFaseAreas() {
    const canvas = document.getElementById('canvas-area');
    canvas.innerHTML = '';
    STATE.fase = 'areas';
    STATE.selected = null;

    // Re-renderizar áreas guardadas
    STATE.figuras.forEach(fig => renderizarFiguraArea(fig));

    // Drop desde sidebar
    canvas.addEventListener('dragover', (e) => e.preventDefault());
    canvas.addEventListener('drop', onDropArea);

    // Mouse events en canvas
    canvas.addEventListener('mousedown', onCanvasMouseDown);
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);

    // Click en canvas vacío → deseleccionar
    canvas.addEventListener('click', (e) => {
        if (e.target === canvas) deseleccionar();
    });

    actualizarUI();
}

function onDropArea(e) {
    e.preventDefault();
    if (STATE.fase !== 'areas') return;
    const tipo = e.dataTransfer.getData('figura-tipo');
    if (!tipo) return;

    const canvas = document.getElementById('canvas-area');
    const rect = canvas.getBoundingClientRect();
    const w = tipo === 'rect-h' ? 200 : (tipo === 'rect-v' ? 120 : 140);
    const h = tipo === 'rect-v' ? 200 : (tipo === 'rect-h' ? 120 : 140);
    const x = snapVal(e.clientX - rect.left - w / 2);
    const y = snapVal(e.clientY - rect.top - h / 2);

    const nombre = `Área ${STATE.contadorFiguras}`;
    const id = `area-${Date.now()}-${STATE.contadorFiguras}`;
    STATE.contadorFiguras++;

    const fig = { id, tipo, x, y, w, h, nombre };
    STATE.figuras.push(fig);
    if (!STATE.mesasPorArea[id]) STATE.mesasPorArea[id] = [];
    renderizarFiguraArea(fig);
    seleccionarFigura(fig);
    actualizarPanelLateral();
}

function renderizarFiguraArea(fig) {
    const canvas = document.getElementById('canvas-area');

    // Eliminar versión anterior si existe
    const viejo = document.getElementById(fig.id);
    if (viejo) viejo.remove();

    const el = document.createElement('div');
    el.id = fig.id;
    el.className = 'figura-area';
    el.dataset.id = fig.id;

    const isCircle = fig.tipo === 'circulo';
    const borderRadius = isCircle ? '50%' : '6px';

    Object.assign(el.style, {
        position: 'absolute',
        left: `${fig.x}px`,
        top: `${fig.y}px`,
        width: `${fig.w}px`,
        height: `${fig.h}px`,
        background: 'rgba(0, 161, 156, 0.08)',
        border: '2px solid rgba(0, 161, 156, 0.6)',
        borderRadius,
        cursor: 'move',
        userSelect: 'none',
        zIndex: '5',
        boxSizing: 'border-box',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
    });

    // Etiqueta editable
    const lbl = document.createElement('div');
    lbl.className = 'area-label';
    lbl.contentEditable = true;
    lbl.innerText = fig.nombre;
    lbl.style.cssText = 'color:#00A19C; font-weight:700; font-size:13px; text-align:center; outline:none; cursor:text; padding:2px 6px; border-radius:3px; background:transparent; max-width:90%; word-break:break-word;';
    lbl.addEventListener('input', () => { fig.nombre = lbl.innerText; });
    lbl.addEventListener('click', (e) => e.stopPropagation());
    lbl.addEventListener('mousedown', (e) => e.stopPropagation());
    el.appendChild(lbl);

    // Contador de mesas
    const mesaCount = document.createElement('div');
    mesaCount.className = 'area-mesa-count';
    mesaCount.style.cssText = 'color:rgba(0,161,156,0.6); font-size:10px; margin-top:4px;';
    el.appendChild(mesaCount);

    // Handles de resize (4 esquinas)
    ['nw', 'ne', 'sw', 'se'].forEach(pos => {
        const h = document.createElement('div');
        h.className = `resize-handle resize-${pos}`;
        h.dataset.handle = pos;
        h.dataset.figId = fig.id;
        const s = 10;
        const baseStyle = `position:absolute; width:${s}px; height:${s}px; background:#00A19C; border-radius:2px; cursor:${pos}-resize; z-index:20;`;
        const topBot = pos.startsWith('n') ? `top:-${s / 2}px` : `bottom:-${s / 2}px`;
        const leftRight = pos.endsWith('w') ? `left:-${s / 2}px` : `right:-${s / 2}px`;
        h.style.cssText = `${baseStyle} ${topBot}; ${leftRight};`;
        h.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            STATE.resizing = fig;
            STATE.resizeHandle = pos;
            STATE.resizeStart = { mouseX: e.clientX, mouseY: e.clientY, x: fig.x, y: fig.y, w: fig.w, h: fig.h };
            e.preventDefault();
        });
        el.appendChild(h);
    });

    // Botón "Diseñar Mesas"
    if (STATE.fase === 'areas') {
        const btn = document.createElement('button');
        btn.className = 'btn-disenar-mesas';
        btn.innerHTML = '&#9998; Mesas';
        btn.style.cssText = 'position:absolute; bottom:6px; right:6px; background:#00A19C; color:#08090A; border:none; border-radius:4px; font-size:9px; font-weight:700; padding:3px 7px; cursor:pointer; z-index:25; text-transform:uppercase; letter-spacing:0.5px;';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            entrarFaseMesas(fig);
        });
        el.appendChild(btn);
    }

    el.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('resize-handle') || e.target === lbl || e.target.classList.contains('btn-disenar-mesas')) return;
        STATE.dragging = fig;
        const canvasRect = document.getElementById('canvas-area').getBoundingClientRect();
        STATE.offsetX = e.clientX - canvasRect.left - fig.x;
        STATE.offsetY = e.clientY - canvasRect.top - fig.y;
        seleccionarFigura(fig);
        e.preventDefault();
    });

    el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        entrarFaseMesas(fig);
    });

    fig.el = el;
    canvas.appendChild(el);
    actualizarContadorMesas(fig);
}

function actualizarContadorMesas(fig) {
    if (!fig.el) return;
    const count = (STATE.mesasPorArea[fig.id] || []).length;
    const el = fig.el.querySelector('.area-mesa-count');
    if (el) el.innerText = count > 0 ? `${count} mesa${count > 1 ? 's' : ''}` : 'Sin mesas';
}

function seleccionarFigura(fig) {
    deseleccionar();
    STATE.selected = fig;
    if (fig.el) {
        fig.el.style.border = '2px solid #00A19C';
        fig.el.style.boxShadow = '0 0 0 3px rgba(0,161,156,0.35), 0 4px 20px rgba(0,161,156,0.2)';
        fig.el.querySelectorAll('.resize-handle').forEach(h => h.style.opacity = '1');
    }
    actualizarPanelEdicionArea(fig);
}

function deseleccionar() {
    if (STATE.selected && STATE.selected.el) {
        STATE.selected.el.style.boxShadow = 'none';
        STATE.selected.el.style.border = '2px solid rgba(0,161,156,0.6)';
        STATE.selected.el.querySelectorAll('.resize-handle').forEach(h => h.style.opacity = '0.4');
    }
    STATE.selected = null;
    ocultarPanelEdicion();
}

// ============================================================
// FASE 2: DISEÑO DE MESAS
// ============================================================
function entrarFaseMesas(fig) {
    STATE.fase = 'mesas';
    STATE.areaActiva = fig;
    STATE.selected = null;

    const canvas = document.getElementById('canvas-area');
    canvas.innerHTML = '';

    // Fondo representando el área
    const fondoArea = document.createElement('div');
    fondoArea.id = 'fondo-area';
    const isCircle = fig.tipo === 'circulo';
    Object.assign(fondoArea.style, {
        position: 'absolute',
        left: `${fig.x}px`, top: `${fig.y}px`,
        width: `${fig.w}px`, height: `${fig.h}px`,
        background: 'rgba(0, 161, 156, 0.04)',
        border: '2px dashed rgba(0,161,156,0.4)',
        borderRadius: isCircle ? '50%' : '6px',
        pointerEvents: 'none',
        zIndex: '1',
        boxSizing: 'border-box',
    });
    canvas.appendChild(fondoArea);

    // Renderizar mesas existentes en esta área
    const mesas = STATE.mesasPorArea[fig.id] || [];
    mesas.forEach(m => renderizarMesa(m));

    // Drop de nuevas mesas
    canvas.addEventListener('dragover', (e) => e.preventDefault());
    canvas.removeEventListener('drop', onDropArea);
    canvas.addEventListener('drop', onDropMesa);

    canvas.addEventListener('click', (e) => {
        if (e.target === canvas || e.target === fondoArea) deseleccionarMesa();
    });

    actualizarUI();
}

function onDropMesa(e) {
    e.preventDefault();
    if (STATE.fase !== 'mesas') return;
    const tipo = e.dataTransfer.getData('figura-tipo');
    if (!tipo) return;

    const canvas = document.getElementById('canvas-area');
    const rect = canvas.getBoundingClientRect();
    const w = tipo === 'rect-h' ? 110 : (tipo === 'rect-v' ? 70 : 80);
    const h = tipo === 'rect-v' ? 110 : (tipo === 'rect-h' ? 70 : 80);
    const x = snapVal(e.clientX - rect.left - w / 2);
    const y = snapVal(e.clientY - rect.top - h / 2);

    const areaId = STATE.areaActiva.id;
    const num = `T-${STATE.contadorMesas++}`;
    const id = `mesa-${Date.now()}`;
    const mesa = { id, tipo, x, y, w, h, numero: num, capacidad: 4, areaId };

    if (!STATE.mesasPorArea[areaId]) STATE.mesasPorArea[areaId] = [];
    STATE.mesasPorArea[areaId].push(mesa);
    renderizarMesa(mesa);
    actualizarContadorMesas(STATE.areaActiva);
    seleccionarMesa(mesa);
}

function renderizarMesa(mesa) {
    const canvas = document.getElementById('canvas-area');
    const viejo = document.getElementById(mesa.id);
    if (viejo) viejo.remove();

    const el = document.createElement('div');
    el.id = mesa.id;
    el.className = 'mesa-activa';
    el.dataset.mesaId = mesa.id;

    const isCircle = mesa.tipo === 'circulo';
    Object.assign(el.style, {
        position: 'absolute',
        left: `${mesa.x}px`, top: `${mesa.y}px`,
        width: `${mesa.w}px`, height: `${mesa.h}px`,
        background: '#101214',
        border: '2px solid #00A19C',
        borderRadius: isCircle ? '50%' : '8px',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        cursor: 'move', userSelect: 'none',
        zIndex: '10', color: 'white',
        boxSizing: 'border-box',
        transition: 'box-shadow 0.15s',
    });

    // Ícono de personas
    el.innerHTML = `
        <span class="mesa-num" style="font-weight:700;color:#00A19C;font-size:12px;line-height:1.2;">${escapeHtml(mesa.numero)}</span>
        <span class="mesa-pax" style="font-size:9px;color:#8A8D91;display:flex;align-items:center;gap:2px;">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#8A8D91" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            ${mesa.capacidad}
        </span>
    `;

    // Resize handles
    ['nw', 'ne', 'sw', 'se'].forEach(pos => {
        const rh = document.createElement('div');
        rh.className = `resize-handle resize-${pos}`;
        rh.dataset.handle = pos;
        rh.dataset.mesaId = mesa.id;
        const s = 8;
        const topBot = pos.startsWith('n') ? `top:-${s / 2}px` : `bottom:-${s / 2}px`;
        const leftRight = pos.endsWith('w') ? `left:-${s / 2}px` : `right:-${s / 2}px`;
        rh.style.cssText = `position:absolute;width:${s}px;height:${s}px;background:#00A19C;border-radius:2px;cursor:${pos}-resize;z-index:25;opacity:0.5;${topBot};${leftRight};`;
        rh.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            STATE.resizing = mesa;
            STATE.resizeHandle = pos;
            STATE.resizeStart = { mouseX: e.clientX, mouseY: e.clientY, x: mesa.x, y: mesa.y, w: mesa.w, h: mesa.h };
            e.preventDefault();
        });
        el.appendChild(rh);
    });

    el.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('resize-handle')) return;
        STATE.dragging = mesa;
        const canvasRect = document.getElementById('canvas-area').getBoundingClientRect();
        STATE.offsetX = e.clientX - canvasRect.left - mesa.x;
        STATE.offsetY = e.clientY - canvasRect.top - mesa.y;
        seleccionarMesa(mesa);
        e.preventDefault();
    });

    el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        abrirEditorMesa(mesa);
    });

    mesa.el = el;
    canvas.appendChild(el);
}

function seleccionarMesa(mesa) {
    deseleccionarMesa();
    STATE.selected = mesa;
    if (mesa.el) {
        mesa.el.style.boxShadow = '0 0 0 3px rgba(0,161,156,0.5), 0 4px 20px rgba(0,161,156,0.3)';
        mesa.el.querySelectorAll('.resize-handle').forEach(h => h.style.opacity = '1');
    }
    actualizarPanelEdicionMesa(mesa);
}

function deseleccionarMesa() {
    if (STATE.selected && STATE.selected.el) {
        STATE.selected.el.style.boxShadow = 'none';
        STATE.selected.el.querySelectorAll('.resize-handle').forEach(h => h.style.opacity = '0.5');
    }
    STATE.selected = null;
    ocultarPanelEdicion();
}

// ============================================================
// DRAG & RESIZE — MOTOR UNIFICADO
// ============================================================
function onCanvasMouseDown(e) {
    // Usado solo en fase areas desde event listener del canvas
}

function onWindowMouseMove(e) {
    const canvas = document.getElementById('canvas-area');
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();

    if (STATE.dragging) {
        const newX = snapVal(e.clientX - canvasRect.left - STATE.offsetX);
        const newY = snapVal(e.clientY - canvasRect.top - STATE.offsetY);
        STATE.dragging.x = newX;
        STATE.dragging.y = newY;
        if (STATE.dragging.el) {
            STATE.dragging.el.style.left = `${newX}px`;
            STATE.dragging.el.style.top = `${newY}px`;
        }
    }

    if (STATE.resizing && STATE.resizeStart) {
        const dx = e.clientX - STATE.resizeStart.mouseX;
        const dy = e.clientY - STATE.resizeStart.mouseY;
        const obj = STATE.resizing;
        const s = STATE.resizeStart;
        const minSize = 50;
        let { x, y, w, h } = s;

        const pos = STATE.resizeHandle;
        if (pos.endsWith('e')) w = Math.max(minSize, snapVal(s.w + dx));
        if (pos.endsWith('w')) { w = Math.max(minSize, snapVal(s.w - dx)); x = s.x + (s.w - w); }
        if (pos.startsWith('s')) h = Math.max(minSize, snapVal(s.h + dy));
        if (pos.startsWith('n')) { h = Math.max(minSize, snapVal(s.h - dy)); y = s.y + (s.h - h); }

        obj.x = x; obj.y = y; obj.w = w; obj.h = h;
        if (obj.el) {
            Object.assign(obj.el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
        }
        // Sincronizar border-radius si es círculo
        if (obj.tipo === 'circulo' && obj.el) obj.el.style.borderRadius = '50%';
    }
}

function onWindowMouseUp() {
    STATE.dragging = null;
    STATE.resizing = null;
    STATE.resizeStart = null;
    STATE.resizeHandle = null;
}

window.addEventListener('mousemove', onWindowMouseMove);
window.addEventListener('mouseup', onWindowMouseUp);

// ============================================================
// PANEL DE EDICIÓN — ÁREAS
// ============================================================
function actualizarPanelEdicionArea(fig) {
    const panel = document.getElementById('panel-edicion');
    if (!panel) return;
    panel.style.display = 'block';
    panel.innerHTML = `
        <div class="panel-header">EDITAR ÁREA</div>
        <label class="panel-label">Nombre</label>
        <input id="edit-area-nombre" class="panel-input" value="${escapeHtml(fig.nombre)}" oninput="actualizarNombreArea(this.value)" />
        <div style="display:flex;gap:8px;margin-top:8px;">
            <div style="flex:1">
                <label class="panel-label">Ancho (px)</label>
                <input id="edit-area-w" class="panel-input" type="number" value="${fig.w}" min="80" step="10" oninput="redimensionarArea('w',this.value)" />
            </div>
            <div style="flex:1">
                <label class="panel-label">Alto (px)</label>
                <input id="edit-area-h" class="panel-input" type="number" value="${fig.h}" min="80" step="10" oninput="redimensionarArea('h',this.value)" />
            </div>
        </div>
        <button class="btn-panel-primary" style="margin-top:12px;" onclick="entrarFaseMesas(STATE.selected)">&#9998; Diseñar Mesas</button>
        <button class="btn-panel-danger" style="margin-top:6px;" onclick="eliminarAreaSeleccionada()">&#128465; Eliminar Área</button>
    `;
}

function actualizarNombreArea(val) {
    if (!STATE.selected) return;
    STATE.selected.nombre = val;
    const lbl = STATE.selected.el && STATE.selected.el.querySelector('.area-label');
    if (lbl) lbl.innerText = val;
}

function redimensionarArea(dim, val) {
    if (!STATE.selected) return;
    const v = Math.max(80, parseInt(val) || 80);
    STATE.selected[dim] = v;
    if (STATE.selected.el) STATE.selected.el.style[dim === 'w' ? 'width' : 'height'] = `${v}px`;
}

function eliminarAreaSeleccionada() {
    if (!STATE.selected) return;
    if (!confirm(`¿Eliminar "${STATE.selected.nombre}" y todas sus mesas?`)) return;
    if (STATE.selected.el) STATE.selected.el.remove();
    STATE.figuras = STATE.figuras.filter(f => f.id !== STATE.selected.id);
    delete STATE.mesasPorArea[STATE.selected.id];
    deseleccionar();
    actualizarPanelLateral();
}

// ============================================================
// PANEL DE EDICIÓN — MESAS
// ============================================================
function actualizarPanelEdicionMesa(mesa) {
    const panel = document.getElementById('panel-edicion');
    if (!panel) return;
    panel.style.display = 'block';
    panel.innerHTML = `
        <div class="panel-header">EDITAR MESA</div>
        <label class="panel-label">Nombre / Número</label>
        <input id="edit-mesa-num" class="panel-input" value="${escapeHtml(mesa.numero)}" />
        <label class="panel-label" style="margin-top:8px;">Capacidad (personas)</label>
        <div style="display:flex;align-items:center;gap:8px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00A19C" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <input id="edit-mesa-cap" class="panel-input" type="number" value="${mesa.capacidad}" min="1" max="30" style="flex:1;" />
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;">
            <div style="flex:1">
                <label class="panel-label">Ancho (px)</label>
                <input id="edit-mesa-w" class="panel-input" type="number" value="${mesa.w}" min="50" step="5" oninput="redimensionarMesa('w',this.value)" />
            </div>
            <div style="flex:1">
                <label class="panel-label">Alto (px)</label>
                <input id="edit-mesa-h" class="panel-input" type="number" value="${mesa.h}" min="50" step="5" oninput="redimensionarMesa('h',this.value)" />
            </div>
        </div>
        <button class="btn-panel-primary" style="margin-top:12px;" onclick="aplicarCambiosMesa()">✔ Aplicar</button>
        <button class="btn-panel-danger" style="margin-top:6px;" onclick="eliminarMesaSeleccionada()">&#128465; Eliminar Mesa</button>
    `;
}

function abrirEditorMesa(mesa) {
    seleccionarMesa(mesa);
}

function aplicarCambiosMesa() {
    if (!STATE.selected) return;
    const mesa = STATE.selected;
    const num = document.getElementById('edit-mesa-num').value.trim();
    const cap = parseInt(document.getElementById('edit-mesa-cap').value) || 1;
    mesa.numero = num;
    mesa.capacidad = cap;
    if (mesa.el) {
        mesa.el.querySelector('.mesa-num').innerText = num;
        mesa.el.querySelector('.mesa-pax').innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#8A8D91" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${cap}`;
    }
}

function redimensionarMesa(dim, val) {
    if (!STATE.selected) return;
    const v = Math.max(50, parseInt(val) || 50);
    STATE.selected[dim] = v;
    if (STATE.selected.el) STATE.selected.el.style[dim === 'w' ? 'width' : 'height'] = `${v}px`;
}

function eliminarMesaSeleccionada() {
    if (!STATE.selected) return;
    const mesa = STATE.selected;
    if (mesa.el) mesa.el.remove();
    STATE.mesasPorArea[mesa.areaId] = (STATE.mesasPorArea[mesa.areaId] || []).filter(m => m.id !== mesa.id);
    deseleccionarMesa();
    if (STATE.areaActiva) actualizarContadorMesas(STATE.areaActiva);
}

function ocultarPanelEdicion() {
    const panel = document.getElementById('panel-edicion');
    if (panel) panel.style.display = 'none';
}

// ============================================================
// UI — PANEL LATERAL: LISTA DE ÁREAS
// ============================================================
function actualizarPanelLateral() {
    const lista = document.getElementById('lista-areas');
    if (!lista) return;
    lista.innerHTML = '';

    if (STATE.figuras.length === 0) {
        lista.innerHTML = '<p style="color:#555;font-size:11px;text-align:center;margin-top:8px;">Arrastra figuras al lienzo</p>';
        return;
    }

    STATE.figuras.forEach(fig => {
        const item = document.createElement('div');
        item.className = 'area-list-item';
        item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:6px;cursor:pointer;border:1px solid transparent;transition:all 0.15s;margin-bottom:4px;background:#0D0E10;';
        const mCount = (STATE.mesasPorArea[fig.id] || []).length;
        item.innerHTML = `
            <div style="display:flex;flex-direction:column;">
                <span style="color:#E5E4E2;font-size:12px;font-weight:600;">${escapeHtml(fig.nombre)}</span>
                <span style="color:#555;font-size:10px;">${mCount} mesa${mCount !== 1 ? 's' : ''}</span>
            </div>
            <button onclick="event.stopPropagation();entrarFaseMesasById('${fig.id}')" style="background:#00A19C22;color:#00A19C;border:1px solid #00A19C44;border-radius:4px;font-size:9px;padding:3px 7px;cursor:pointer;font-weight:700;">MESAS</button>
        `;
        item.addEventListener('click', () => {
            if (STATE.fase === 'areas') seleccionarFigura(fig);
        });
        item.addEventListener('mouseenter', () => item.style.borderColor = '#00A19C44');
        item.addEventListener('mouseleave', () => item.style.borderColor = 'transparent');
        lista.appendChild(item);
    });
}

function entrarFaseMesasById(id) {
    const fig = STATE.figuras.find(f => f.id === id);
    if (fig) entrarFaseMesas(fig);
}

function actualizarUI() {
    actualizarPanelLateral();
    actualizarBotonesNav();
}

function actualizarBotonesNav() {
    const btnVolver = document.getElementById('btn-volver-areas');
    const tituloFase = document.getElementById('titulo-fase');
    const asideMesas = document.getElementById('sidebar-formas-mesas');
    const asideAreas = document.getElementById('sidebar-formas-areas');
    const areaActivaNombre = document.getElementById('area-activa-nombre');

    if (btnVolver) btnVolver.style.display = STATE.fase === 'mesas' ? 'flex' : 'none';
    if (asideMesas) asideMesas.style.display = STATE.fase === 'mesas' ? 'block' : 'none';
    if (asideAreas) asideAreas.style.display = STATE.fase === 'areas' ? 'block' : 'none';

    if (tituloFase) tituloFase.innerText = STATE.fase === 'mesas' ? 'Diseño de Mesas' : 'Diseño de Áreas';
    if (areaActivaNombre && STATE.areaActiva) {
        areaActivaNombre.innerText = STATE.areaActiva.nombre;
        areaActivaNombre.style.display = STATE.fase === 'mesas' ? 'block' : 'none';
    }
}

function volverAreas() {
    if (STATE.areaActiva) actualizarContadorMesas(STATE.areaActiva);
    STATE.fase = 'areas';
    STATE.areaActiva = null;
    STATE.selected = null;
    ocultarPanelEdicion();

    const canvas = document.getElementById('canvas-area');
    canvas.innerHTML = '';
    canvas.removeEventListener('drop', onDropMesa);
    canvas.addEventListener('drop', onDropArea);

    STATE.figuras.forEach(fig => renderizarFiguraArea(fig));
    actualizarUI();
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (STATE.fase === 'mesas') deseleccionarMesa();
            else deseleccionar();
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && e.target.tagName !== 'INPUT') {
            if (STATE.fase === 'mesas' && STATE.selected) eliminarMesaSeleccionada();
            else if (STATE.fase === 'areas' && STATE.selected) eliminarAreaSeleccionada();
        }
    });
}
// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================


// ============================================================
// GUARDAR — SUPABASE
// ============================================================
async function guardarCroquis() {
    const canvas = document.getElementById('canvas-area');
    const areaId = parseInt(canvas.dataset.areaId, 10);
    const btn = document.querySelector('[onclick="guardarCroquis()"]');
    
    if (btn) { btn.innerText = 'GUARDANDO...'; btn.disabled = true; }

    const payload = {
        area_id: areaId,
        areas: STATE.figuras.map(f => ({
            id: f.id,
            nombre: f.nombre,
            tipo: f.tipo,
            x: f.x, y: f.y,
            w: f.w, h: f.h,
        })),
        mesas: Object.entries(STATE.mesasPorArea).flatMap(([areaFigId, mesas]) =>
            mesas.map(m => ({
                id: m.id,
                numero: m.numero,
                forma: m.tipo,
                capacidad: m.capacidad,
                pos_x: m.x, pos_y: m.y,
                ancho: m.w, alto: m.h,
                area_fig_id: areaFigId,
            }))
        ),
    };

    try {
        const res = await fetch('/areas/guardar-croquis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        
        const data = await res.json();
        if (btn) { btn.innerText = 'GUARDAR TODO'; btn.disabled = false; }
        
        if (data.success) {
            mostrarToast('✅ Diseño guardado correctamente');
            
            // LÓGICA NUEVA: Si guardamos estando en Áreas, saltar automáticamente a diseñar las Mesas de la primera área creada
            if (STATE.fase === 'areas' && STATE.figuras.length > 0) {
                setTimeout(() => {
                    entrarFaseMesas(STATE.figuras[0]);
                }, 1000); // Pausa de 1 segundo para que el usuario lea el Toast de éxito
            }
        } else {
            mostrarToast('❌ Error: ' + data.message, true);
        }
    } catch (err) {
        if (btn) { btn.innerText = 'GUARDAR TODO'; btn.disabled = false; }
        mostrarToast('❌ Error de red', true);
        console.error(err);
    }
}

function mostrarToast(msg, isError = false) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:24px;right:24px;background:${isError ? '#3D1515' : '#0D2B2A'};color:${isError ? '#FF6B6B' : '#00A19C'};border:1px solid ${isError ? '#FF6B6B44' : '#00A19C44'};padding:12px 20px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.5);transition:opacity 0.3s;`;
    t.innerText = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
}



// ============================================================
// CARGAR MESAS GUARDADAS DESDE EL DOM (EJS)
// ============================================================
function cargarMesasGuardadas() {
    // Cargar áreas desde data attributes si los hay
    const dataMesas = document.getElementById('data-mesas-guardadas');
    if (!dataMesas) return;
    try {
        // Idempotente: la hidratación puede invocarse antes y durante DOMContentLoaded.
        Object.keys(STATE.mesasPorArea).forEach(k => { STATE.mesasPorArea[k] = []; });
        STATE.contadorMesas = 1;
        const mesasGuardadas = JSON.parse(dataMesas.textContent || '[]');
        mesasGuardadas.forEach(m => {
            if (!STATE.mesasPorArea[m.area_fig_id]) STATE.mesasPorArea[m.area_fig_id] = [];
            STATE.mesasPorArea[m.area_fig_id].push({
                id: m.id_externo || `mesa-db-${m.id}`,
                tipo: m.forma, x: m.pos_x, y: m.pos_y,
                w: m.ancho, h: m.alto,
                numero: m.numero, capacidad: m.capacidad,
                areaId: m.area_fig_id,
            });
            STATE.contadorMesas++;
        });
    } catch (e) { console.warn('No se pudieron cargar mesas guardadas', e); }
}

// Re-render utilizado por la vista después de hidratar las áreas del servidor.
window.renderizarCroquisHidratado = function renderizarCroquisHidratado() {
    const canvas = document.getElementById('canvas-area');
    if (!canvas) return;
    canvas.querySelectorAll('.figura-area').forEach(el => el.remove());
    STATE.figuras.forEach(fig => renderizarFiguraArea(fig));
    cargarMesasGuardadas();
    actualizarUI();
};
