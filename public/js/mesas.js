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
    const { value: cantidadRes } = await Swal.fire({
        title: `Cantidad: ${p.nombre}`,
        input: 'number',
        inputValue: 1,
        showCancelButton: true,
        confirmButtonText: 'Siguiente',
        target: canvasEl 
    });

    if (!cantidadRes) return;

    // 2️⃣ Nota
    const { value: notaRes } = await Swal.fire({
        title: 'Agrega una nota',
        input: 'text',
        inputPlaceholder: 'Ej: sin cebolla...',
        showCancelButton: true,
        target: canvasEl
    });

    try {
        const pedidoId = $('#pedidoMesa').data('pedido-id');
        
        const resp = await fetch(`/mesas/pedidos/${pedidoId}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                producto_id: p.id,
                cantidad: Number(cantidadRes),
                precio: Number(p.precio_unidad || p.precio_unitario),
                nota: notaRes || '',
                unidad: 'UND',
                alergia_aviso: String(opciones.alergiaAviso || '').trim().slice(0, 200)
            })
        });

        if (!resp.ok) {
            const errorData = await resp.json().catch(() => ({}));
            throw new Error(errorData.error || "Error al agregar producto");
        }

        Swal.fire({ icon: 'success', title: 'Agregado', timer: 800, showConfirmButton: false, target: canvasEl });
        if (window.recargarItemsActuales) window.recargarItemsActuales(pedidoId);

    } catch (err) {
        console.error("❌ Error:", err);
        Swal.fire({ icon: 'error', title: 'Error', text: err.message, target: canvasEl });
    }
};

// 2. Lógica Principal
$(function() {
    const canvas = new bootstrap.Offcanvas('#canvasPedido');
    let items = []; 

    window.recargarItemsActuales = function(id) { cargarItemsPedido(id); };

    window.gestionarMesa = function(id, numero, estado) {
        if (estado === 'libre') {
            Swal.fire({
                title: `Mesa #${numero}`,
                text: "Nombre del cliente:",
                input: 'text',
                showCancelButton: true,
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
        } catch(err) { Swal.fire({icon:'error', title: err.message}); }
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
            Swal.fire({ icon: 'error', title: 'No se pudo abrir la mesa', text: err.message });
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
            Swal.fire({
                icon: 'warning',
                title: 'Falta la alergia',
                text: 'Escribe a qué ingrediente es alérgico el cliente.',
                target: document.getElementById('modalInfoProducto')
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
        $('#totalPedido').text(formatear(total));
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
                return Swal.fire({ icon: 'warning', title: 'Pedido vacío', target: '#canvasPedido' });
            }

            const totalPedido = items.reduce((acc, it) => acc + (Number(it.subtotal || (it.cantidad * (it.precio_unitario || it.precio)))), 0);

            const { value: formaPago } = await Swal.fire({
                title: `Total: ${formatear(totalPedido)}`,
                input: 'select',
                inputOptions: { efectivo: '💵 Efectivo', transferencia: '💳 Transferencia' },
                showCancelButton: true,
                target: '#canvasPedido'
            });

            if(!formaPago) return;

            if(formaPago === 'efectivo') {
                const { value: entregado } = await Swal.fire({
                    title: '¿Con cuánto paga?',
                    input: 'number',
                    inputValue: totalPedido,
                    showCancelButton: true,
                    target: '#canvasPedido',
                    inputValidator: (v) => { if(Number(v) < totalPedido) return 'Dinero insuficiente'; }
                });
                if(!entregado) return;
                
                const cambio = Number(entregado) - totalPedido;
                await Swal.fire({
                    title: 'Cambio:',
                    html: `<h1 class="display-4 text-success">${formatear(cambio)}</h1>`,
                    target: '#canvasPedido'
                });
            }

            const resp = await fetch(`/mesas/pedidos/${pedidoId}/facturar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ forma_pago: formaPago })
            });

            const dataRespuesta = await resp.json(); 
            if(!resp.ok) throw new Error(dataRespuesta.error || "Error al facturar");

            cerrarMenuLateral();
            Swal.fire({ icon: 'success', title: 'Venta Cerrada' }).then(() => location.reload());

        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error', text: err.message, target: '#canvasPedido' });
        }
    });

    // --- Botón: Enviar comanda a Cocina/Bar ---
    $('#btnEnviarCocina').on('click', async () => {
        const pedidoId = $('#pedidoMesa').data('pedido-id');
        if (!pedidoId) {
            return Swal.fire({ icon: 'warning', title: 'Sin pedido', text: 'Abre un pedido antes de enviar la comanda.', target: '#canvasPedido' });
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
            await Swal.fire({
                icon: enviados > 0 ? 'success' : 'info',
                title: enviados > 0 ? 'Comanda enviada' : 'Sin cambios',
                text: enviados > 0 ? `${enviados} producto(s) enviados a producción.` : 'No hay productos pendientes por enviar.',
                timer: enviados > 0 ? 1400 : undefined,
                showConfirmButton: enviados === 0,
                target: '#canvasPedido'
            });
            if (window.recargarItemsActuales) await window.recargarItemsActuales(pedidoId);
            if (enviados > 0) cerrarMenuLateral();
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error al enviar', text: err.message, target: '#canvasPedido' });
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
