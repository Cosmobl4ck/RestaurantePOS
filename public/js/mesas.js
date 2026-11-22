window.swalPos = function (opts) {
    return Swal.fire(Object.assign({
        target: document.body,
        backdrop: true,
        confirmButtonText: 'Aceptar',
        cancelButtonText: 'Cancelar',
        reverseButtons: true,
        width: 'min(92vw, 430px)',
        customClass: { popup: 'swal-pos' }
    }, opts || {}));
};

// El offcanvas atrapa el foco; sin esto, el input del Swal no se puede editar.
document.addEventListener('shown.bs.offcanvas', (event) => {
    const instance = bootstrap.Offcanvas.getInstance(event.target);
    if (instance && instance._focustrap) instance._focustrap.deactivate();
});

// 1. Funciones Globales
function cerrarMenuLateral() {
    const canvasElement = document.getElementById('canvasPedido');
    const bsOffcanvas = bootstrap.Offcanvas.getInstance(canvasElement);
    if (bsOffcanvas) bsOffcanvas.hide();
}

window.seleccionarProducto = async function(p, opciones = {}) {
    // Solución para focus de Modales sobre Offcanvas
    if ($.fn.modal) $.fn.modal.Constructor.prototype._enforceFocus = function() {}; 
    const canvasEl = document.getElementById('canvasPedido');
    canvasEl.removeAttribute('tabindex');

    // 1️⃣ Cantidad
    const { value: cantidadRes } = await swalPos({
        title: `Cantidad: ${p.nombre}`,
        input: 'number',
        inputValue: 1,
        showCancelButton: true,
        confirmButtonText: 'Siguiente',});

    if (!cantidadRes) return;

    // 2️⃣ Nota
    const { value: notaRes } = await swalPos({
        title: 'Agrega una nota',
        input: 'text',
        inputPlaceholder: 'Ej: sin cebolla...',
        showCancelButton: true,
        confirmButtonText: 'Agregar'
    });

    try {
        const pedidoId = $('#pedidoMesa').data('pedido-id');
        
        const resp = await fetch(`/mesas/pedidos/${pedidoId}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                producto_id: p.id,
                cantidad: Number(cantidadRes),
                nota: notaRes || '',
                unidad: 'UND',
                alergia_aviso: String(opciones.alergiaAviso || '').trim().slice(0, 200)
            })
        });

        if (!resp.ok) {
            const errorData = await resp.json().catch(() => ({}));
            throw new Error(errorData.error || "Error al agregar producto");
        }

        swalPos({ icon: 'success', title: 'Agregado', timer: 800, showConfirmButton: false,});
        if (window.recargarItemsActuales) window.recargarItemsActuales(pedidoId);

    } catch (err) {
        console.error("❌ Error:", err);
        swalPos({ icon: 'error', title: 'Error', text: err.message,});
    }
};

// 2. Lógica Principal
$(function() {
    const canvas = new bootstrap.Offcanvas('#canvasPedido');
    let items = []; 

    window.recargarItemsActuales = function(id) { cargarItemsPedido(id); };

    window.gestionarMesa = function(id, numero, estado) {
        if (estado === 'libre') {
            swalPos({
                title: `Mesa #${numero}`,
                text: "Nombre del cliente:",
                input: 'text',
                inputPlaceholder: 'Ej. Juan Pérez',
                showCancelButton: true,
                confirmButtonText: 'Abrir mesa',
                inputValidator: (value) => { if (!value) return '¡Necesitas un nombre!'; }
            }).then((result) => {
                if (result.isConfirmed) abrirMesaNueva(id, result.value);
            });
        } else {
            $('#pedidoMesa').text(numero).data('id', id); 
            recuperarPedido(id);
        }
    };

    document.querySelectorAll('.mesa-card[data-mesa-id]').forEach((card) => {
        card.addEventListener('click', () => window.gestionarMesa(
            Number(card.dataset.mesaId),
            card.dataset.mesaNumero,
            card.dataset.mesaEstado
        ));
    });

    async function abrirMesaNueva(mesaId, nombreCliente) {
        try {
            const resp = await fetch('/mesas/abrir', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ mesa_id: mesaId, cliente_nombre: nombreCliente })
            });
            if(!resp.ok) throw new Error("Error al abrir mesa");
            location.reload();
        } catch(err) { swalPos({icon:'error', title: err.message}); }
    }

    async function recuperarPedido(mesaId) {
        try {
            const resp = await fetch('/mesas/abrir', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ mesa_id: mesaId })
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(data.error || 'No se pudo recuperar el pedido.');
            if (!data.pedido?.id) throw new Error('El pedido no está disponible.');
            $('#pedidoMesa').data('pedido-id', data.pedido.id);
            await cargarItemsPedido(data.pedido.id);
            canvas.show();
        } catch(err) {
            console.error("Error recuperando pedido:", err);
            swalPos({ icon: 'error', title: 'No se pudo abrir la mesa', text: err.message });
        }
    }

    function formatear(valor){ return `$${Number(valor||0).toLocaleString('es-CO')}`; }

    const modalInfoProducto = new bootstrap.Modal(document.getElementById('modalInfoProducto'));
    let productoInfoActual = null;

    window.abrirInfoProducto = function(producto) {
        productoInfoActual = producto;
        const alergenos = Array.isArray(producto.alergenos) ? producto.alergenos : [];
        const contenedorAlergenos = document.getElementById('infoProductoAlergenos');

        document.getElementById('infoProductoNombre').textContent = producto.nombre || 'Producto';
        document.getElementById('infoProductoCodigo').textContent = producto.codigo || '';
        document.getElementById('infoProductoPrecio').textContent = formatear(producto.precio_unidad);
        document.getElementById('infoProductoDescripcion').textContent = producto.descripcion_corta || 'Sin descripción adicional.';
        document.getElementById('infoProductoIngredientes').textContent = producto.ingredientes || 'Ingredientes no especificados.';
        document.getElementById('infoProductoTiempo').textContent = producto.tiempo_preparacion_minutos
            ? `≈ ${producto.tiempo_preparacion_minutos} min`
            : 'No definido';

        contenedorAlergenos.replaceChildren();
        if (!alergenos.length) {
            const sinAlergenos = document.createElement('span');
            sinAlergenos.className = 'info-sin-alergenos';
            sinAlergenos.textContent = 'Sin alérgenos declarados';
            contenedorAlergenos.append(sinAlergenos);
        } else {
            alergenos.forEach((nombre) => {
                const chip = document.createElement('span');
                chip.className = 'alergeno-chip';
                const icono = document.createElement('i');
                icono.className = 'bi bi-exclamation-triangle-fill';
                chip.append(icono, document.createTextNode(String(nombre)));
                contenedorAlergenos.append(chip);
            });
        }

        const check = document.getElementById('infoProductoAlergiaCheck');
        const detalle = document.getElementById('infoProductoAlergiaDetalle');
        check.checked = false;
        detalle.value = '';
        detalle.disabled = true;

        modalInfoProducto.show();
    };

    document.getElementById('infoProductoAlergiaCheck').addEventListener('change', function() {
        const detalle = document.getElementById('infoProductoAlergiaDetalle');
        detalle.disabled = !this.checked;
        if (this.checked) detalle.focus();
    });

    document.getElementById('btnAgregarDesdeInfo').addEventListener('click', function() {
        const producto = productoInfoActual;
        if (!producto) return;

        const check = document.getElementById('infoProductoAlergiaCheck');
        const detalle = document.getElementById('infoProductoAlergiaDetalle');
        const aviso = check.checked ? detalle.value.trim() : '';

        if (check.checked && !aviso) {
            swalPos({
                icon: 'warning',
                title: 'Falta la alergia',
                text: 'Escribe a qué ingrediente es alérgico el cliente.'
            });
            detalle.focus();
            return;
        }

        modalInfoProducto.hide();
        setTimeout(() => window.seleccionarProducto(producto, { alergiaAviso: aviso }), 200);
    });

    function renderItems(){
        const tbody = $('#tbodyItems').empty();
        let total = 0;
        items.forEach((it) => {
            const subtotal = Number(it.subtotal || (it.cantidad * (it.precio_unitario || it.precio)));
            total += subtotal;
            const row = document.createElement('tr');
            const productCell = document.createElement('td');
            productCell.append(document.createTextNode(it.producto_nombre || it.nombre || 'Producto'));
            if (it.alergia_aviso) {
                const alerta = document.createElement('small');
                alerta.className = 'text-danger fw-bold d-block';
                alerta.textContent = `⚠ ALERGIA: ${it.alergia_aviso}`;
                productCell.append(alerta);
            } else if (Array.isArray(it.alergenos) && it.alergenos.length) {
                const contiene = document.createElement('small');
                contiene.className = 'text-danger d-block';
                contiene.textContent = `Contiene: ${it.alergenos.join(', ')}`;
                productCell.append(contiene);
            }
            if (it.nota) {
                productCell.append(document.createElement('br'));
                const note = document.createElement('small');
                note.className = 'text-muted';
                note.textContent = `(${it.nota})`;
                productCell.append(note);
            }
            const quantityCell = document.createElement('td');
            quantityCell.className = 'text-end';
            quantityCell.textContent = String(it.cantidad);
            const subtotalCell = document.createElement('td');
            subtotalCell.className = 'text-end';
            subtotalCell.textContent = formatear(subtotal);
            row.append(productCell, quantityCell, subtotalCell);
            tbody.append(row);
        });
        const propinaPct = Number(window.POS_PROPINA_PORCENTAJE || 0);
        const propina = propinaPct > 0 ? Math.round(total * propinaPct) / 100 : 0;
        const totalConPropina = Math.round((total + propina) * 100) / 100;
        $('#totalPedido').text(formatear(totalConPropina));
        const $propina = $('#propinaPedido');
        if (propina > 0) {
            $propina.text(`Propina ${propinaPct}% incluida: ${formatear(propina)}`).prop('hidden', false);
        } else {
            $propina.text('').prop('hidden', true);
        }
    }

    async function cargarItemsPedido(pedidoId){
        try {
            const resp = await fetch(`/mesas/pedidos/${pedidoId}`);
            const data = await resp.json();
            items = data.items || [];
            renderItems();
        } catch(e) { console.error("Error cargando items:", e); }
    }

    // --- Buscador Unificado ---
    let debounceTimer;
    $('#buscarProductoMesa').on('input', function() {
        const q = this.value.trim();
        const $list = $('#resultadosProductoMesa');
        
        clearTimeout(debounceTimer);
        if (q.length < 2) return $list.empty().hide();

        debounceTimer = setTimeout(async () => {
            try {
                const resp = await fetch(`/productos/buscar?q=${encodeURIComponent(q)}`);
                const productos = await resp.json();
                $list.empty().show();

                productos.forEach(p => {
                    const row = document.createElement('div');
                    row.className = 'list-group-item producto-resultado';

                    const addButton = document.createElement('button');
                    addButton.type = 'button';
                    addButton.className = 'producto-resultado-main';
                    addButton.setAttribute('aria-label', `Agregar ${p.nombre} al pedido`);

                    const description = document.createElement('div');
                    const name = document.createElement('span');
                    name.className = 'fw-bold';
                    name.textContent = p.nombre;
                    const code = document.createElement('small');
                    code.className = 'text-muted ms-2';
                    code.textContent = p.codigo || '';
                    description.append(name, code);

                    const meta = document.createElement('div');
                    meta.className = 'producto-meta text-muted';
                    if (p.tiempo_preparacion_minutos) {
                        const tiempo = document.createElement('span');
                        tiempo.innerHTML = `<i class="bi bi-clock"></i> ≈ ${Number(p.tiempo_preparacion_minutos)} min`;
                        meta.append(tiempo);
                    }
                    if (Array.isArray(p.alergenos) && p.alergenos.length) {
                        const alergia = document.createElement('span');
                        alergia.className = 'text-danger fw-bold';
                        alergia.innerHTML = '<i class="bi bi-exclamation-triangle-fill"></i> Alérgenos';
                        meta.append(alergia);
                    }
                    if (meta.childElementCount) description.append(meta);

                    const price = document.createElement('span');
                    price.className = 'badge bg-teal rounded-pill ms-2';
                    price.textContent = formatear(p.precio_unidad);

                    const infoButton = document.createElement('button');
                    infoButton.type = 'button';
                    infoButton.className = 'producto-info-btn';
                    infoButton.setAttribute('aria-label', `Ver información de ${p.nombre}`);
                    infoButton.innerHTML = '<i class="bi bi-info-circle"></i>';
                    infoButton.addEventListener('click', (event) => {
                        event.stopPropagation();
                        window.abrirInfoProducto(p);
                    });

                    addButton.append(description, price);
                    addButton.addEventListener('click', () => {
                        window.seleccionarProducto(p);
                        $list.hide();
                        $('#buscarProductoMesa').val('');
                    });

                    row.append(addButton, infoButton);
                    $list.append(row);
                });
            } catch(err) { console.error(err); }
        }, 300);
    });

    // --- Botón: Facturar ---
    $('#btnFacturarPedido').off('click').on('click', async function(){
        try {
            const pedidoId = $('#pedidoMesa').data('pedido-id');
            if(!pedidoId || items.length === 0) {
                return swalPos({ icon: 'warning', title: 'Pedido vacío',});
            }

            const totalPedido = items.reduce((acc, it) => acc + (Number(it.subtotal || (it.cantidad * (it.precio_unitario || it.precio)))), 0);
            const propinaConfigurada = Number(window.POS_PROPINA_PORCENTAJE || 0);
            const propinaReducida = Math.max(0, Math.round((propinaConfigurada - 5) * 100) / 100);
            const opcionesPropina = propinaConfigurada > 0
                ? [
                    { valor: propinaConfigurada, etiqueta: `${propinaConfigurada}% (completa)` },
                    ...(propinaReducida !== propinaConfigurada ? [{ valor: propinaReducida, etiqueta: `${propinaReducida}% (quitar 5%)` }] : []),
                    { valor: 0, etiqueta: propinaConfigurada > 0 ? `0% (quitar ${propinaConfigurada}%)` : 'Sin propina' }
                ]
                : [{ valor: 0, etiqueta: 'Sin propina' }];
            const opcionesDescuento = [
                { valor: 0, etiqueta: 'Sin descuento' },
                { valor: 5, etiqueta: '5%' },
                { valor: 10, etiqueta: '10%' },
                { valor: 15, etiqueta: '15%' },
                { valor: 20, etiqueta: '20%' },
                { valor: 'custom', etiqueta: 'Otro %' }
            ];
            const anchoPago = 'min(94vw, 480px)';
            const htmlPropina = opcionesPropina.map((o) => `<option value="${o.valor}">${o.etiqueta}</option>`).join('');
            const htmlDescuento = opcionesDescuento.map((o) => `<option value="${o.valor}">${o.etiqueta}</option>`).join('');

            const { value: ajuste, isConfirmed: ajusteOk } = await swalPos({
                width: anchoPago,
                title: 'Descuento y propina',
                html: `
                    <div class="text-start small">
                        <div class="d-flex justify-content-between mb-2">
                            <span>Subtotal</span>
                            <strong>${formatear(totalPedido)}</strong>
                        </div>
                        <label class="form-label" for="swalDescPct">Descuento</label>
                        <select id="swalDescPct" class="form-select form-select-sm">${htmlDescuento}</select>
                        <div id="swalDescCustomWrap" class="mt-1 d-none">
                            <input id="swalDescCustom" type="number" min="0" max="100" step="0.01" class="form-control form-control-sm" placeholder="Porcentaje de descuento">
                        </div>
                        <input id="swalDescMotivo" type="text" maxlength="200" class="form-control form-control-sm mt-2" placeholder="Motivo del descuento (opcional)">
                        <label class="form-label mt-2" for="swalTipPct">Propina</label>
                        <select id="swalTipPct" class="form-select form-select-sm">${htmlPropina}</select>
                        <label class="form-label mt-2" for="swalFormaPago">Forma de pago</label>
                        <select id="swalFormaPago" class="form-select form-select-sm">
                            <option value="efectivo">💵 Efectivo</option>
                            <option value="tarjeta">💳 Tarjeta</option>
                            <option value="transferencia">🏦 Transferencia</option>
                        </select>
                        <div class="d-flex justify-content-between align-items-center mt-3 pt-2 border-top">
                            <span class="fw-bold">Total a cobrar</span>
                            <strong id="swalTotalPreview" class="fs-2">${formatear(totalPedido)}</strong>
                        </div>
                    </div>`,
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonText: 'Continuar',
                cancelButtonText: 'Cancelar',
                reverseButtons: true,
                didOpen: () => {
                    const popup = Swal.getPopup();
                    const desc = popup.querySelector('#swalDescPct');
                    const descCustom = popup.querySelector('#swalDescCustom');
                    const descWrap = popup.querySelector('#swalDescCustomWrap');
                    const tip = popup.querySelector('#swalTipPct');
                    const preview = popup.querySelector('#swalTotalPreview');

                    const leerAjuste = () => {
                        const descPct = desc.value === 'custom'
                            ? Number(descCustom.value || 0)
                            : Number(desc.value || 0);
                        const tipPct = Number(tip.value || 0);
                        const descuento = Math.round(totalPedido * descPct) / 100;
                        const base = Math.max(0, Math.round((totalPedido - descuento) * 100) / 100);
                        const propina = Math.round(base * tipPct) / 100;
                        const total = Math.round((base + propina) * 100) / 100;
                        return { descPct, tipPct, descuento, base, propina, total };
                    };
                    const actualizar = () => {
                        descWrap.classList.toggle('d-none', desc.value !== 'custom');
                        preview.textContent = formatear(leerAjuste().total);
                    };
                    desc.addEventListener('change', actualizar);
                    descCustom.addEventListener('input', actualizar);
                    tip.addEventListener('change', actualizar);
                    actualizar();
                },
                preConfirm: () => {
                    const popup = Swal.getPopup();
                    const desc = popup.querySelector('#swalDescPct');
                    const descCustom = popup.querySelector('#swalDescCustom');
                    const tip = popup.querySelector('#swalTipPct');
                    const formaPago = popup.querySelector('#swalFormaPago');
                    const motivo = popup.querySelector('#swalDescMotivo');
                    const descPct = desc.value === 'custom' ? Number(descCustom.value || 0) : Number(desc.value || 0);
                    const tipPct = Number(tip.value || 0);
                    if (!Number.isFinite(descPct) || descPct < 0 || descPct > 100) {
                        Swal.showValidationMessage('El descuento debe estar entre 0 y 100.');
                        return false;
                    }
                    const descuento = Math.round(totalPedido * descPct) / 100;
                    const base = Math.max(0, Math.round((totalPedido - descuento) * 100) / 100);
                    const propina = Math.round(base * tipPct) / 100;
                    const total = Math.round((base + propina) * 100) / 100;
                    return {
                        forma_pago: formaPago.value,
                        descuento_porcentaje: descPct,
                        descuento_motivo: String(motivo.value || '').trim(),
                        propina_porcentaje: tipPct,
                        descuento,
                        propina,
                        total
                    };
                }
            });

            if (!ajusteOk || !ajuste) return;
            const formaPago = ajuste.forma_pago || 'efectivo';

            const totalCobrar = Number(ajuste.total);
            const totalTexto = formatear(totalCobrar);
            const detalleAjuste = [
                Number(ajuste.descuento) > 0 ? `<p class="swal-pago-total">Descuento ${ajuste.descuento_porcentaje}%: -${formatear(ajuste.descuento)}</p>` : '',
                Number(ajuste.propina) > 0 ? `<p class="swal-pago-total">Propina ${ajuste.propina_porcentaje}%: ${formatear(ajuste.propina)}</p>` : ''
            ].join('');

            if(formaPago === 'efectivo') {
                const { value: entregado, isConfirmed: pagoOk } = await swalPos({
                    width: anchoPago,
                    title: '¿Con cuánto paga?',
                    html: `<p class="swal-pago-total">Total a pagar</p><p class="swal-pago-monto">${totalTexto}</p>${detalleAjuste}`,
                    input: 'text',
                    inputValue: String(totalCobrar),
                    inputAttributes: { inputmode: 'decimal', autocomplete: 'off', maxlength: '12' },
                    focusConfirm: false,
                    didOpen: () => {
                        const input = Swal.getInput();
                        if (input) {
                            input.focus();
                            input.select();
                        }
                    },
                    showCancelButton: true,
                    confirmButtonText: 'Calcular cambio',
                    cancelButtonText: 'Cancelar',
                    reverseButtons: true,
                    inputValidator: (v) => {
                        const texto = String(v ?? '').trim();
                        if (!texto) return 'Ingresa el monto recibido.';
                        const numero = Number(texto.replace(',', '.'));
                        if (!Number.isFinite(numero)) return 'Monto inválido.';
                        if (numero < totalCobrar) return 'Dinero insuficiente.';
                    }
                });
                if(!pagoOk) return;

                const recibido = Number(String(entregado ?? '').replace(',', '.'));
                const cambio = recibido - totalCobrar;
                await swalPos({
                    width: anchoPago,
                    title: 'Cambio',
                    html: `
                        <div class="swal-cambio">
                            <span>Total: ${totalTexto}</span>
                            <span>Recibido: ${formatear(recibido)}</span>
                            <strong>${formatear(cambio)}</strong>
                            <small>Entrega este cambio al cliente.</small>
                        </div>`,
                    confirmButtonText: 'Aceptar',
                    showCancelButton: false
                });
            }

            const resp = await fetch(`/mesas/pedidos/${pedidoId}/facturar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    forma_pago: formaPago,
                    descuento_porcentaje: ajuste.descuento_porcentaje,
                    descuento_motivo: ajuste.descuento_motivo,
                    propina_porcentaje: ajuste.propina_porcentaje
                })
            });

            const dataRespuesta = await resp.json(); 
            if(!resp.ok) throw new Error(dataRespuesta.error || "Error al facturar");
            const totalFinal = formatear(Number(dataRespuesta.total || totalCobrar));

            cerrarMenuLateral();
            swalPos({
                width: 'min(92vw, 430px)',
                icon: 'success',
                title: 'Venta cerrada',
                html: `<p class="swal-pago-total">Total cobrado</p><p class="swal-pago-monto">${totalFinal}</p>`,
                confirmButtonText: 'Aceptar'
            }).then(() => location.reload());

        } catch (err) {
            swalPos({ icon: 'error', title: 'Error', text: err.message,});
        }
    });

    // --- Botón: Enviar comanda a Cocina/Bar ---
    $('#btnEnviarCocina').on('click', async () => {
        const pedidoId = $('#pedidoMesa').data('pedido-id');
        if (!pedidoId) {
            return swalPos({ icon: 'warning', title: 'Sin pedido', text: 'Abre un pedido antes de enviar la comanda.',});
        }
        const btn = document.getElementById('btnEnviarCocina');
        if (btn) btn.disabled = true;
        try {
            const resp = await fetch(`/mesas/pedidos/${pedidoId}/enviar-comanda`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'No se pudo enviar la comanda.');
            const enviados = Number(data.enviados || 0);
            await swalPos({
                icon: enviados > 0 ? 'success' : 'info',
                title: enviados > 0 ? 'Comanda enviada' : 'Sin cambios',
                text: enviados > 0 ? `${enviados} producto(s) enviados a producción.` : 'No hay productos pendientes por enviar.',
                timer: enviados > 0 ? 1400 : undefined,
                showConfirmButton: enviados === 0,});
            if (window.recargarItemsActuales) await window.recargarItemsActuales(pedidoId);
            if (enviados > 0) cerrarMenuLateral();
        } catch (err) {
            swalPos({ icon: 'error', title: 'Error al enviar', text: err.message,});
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    // Cerrar resultados al clickear fuera
    $(document).on('click', (e) => {
        if (!$(e.target).closest('#buscarProductoMesa, #resultadosProductoMesa').length) {
            $('#resultadosProductoMesa').hide();
        }
    });
});
