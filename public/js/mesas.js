// 1. Funciones Globales
function cerrarMenuLateral() {
    const canvasElement = document.getElementById('canvasPedido');
    const bsOffcanvas = bootstrap.Offcanvas.getInstance(canvasElement);
    if (bsOffcanvas) bsOffcanvas.hide();
}

window.seleccionarProducto = async function(p) {
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
                unidad: 'UND'
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
            const data = await resp.json();
            $('#pedidoMesa').data('pedido-id', data.pedido.id);
            await cargarItemsPedido(data.pedido.id);
            canvas.show();
        } catch(err) { console.error("Error recuperando pedido:", err); }
    }

    function formatear(valor){ return `$${Number(valor||0).toLocaleString('es-CO')}`; }

    function renderItems(){
        const tbody = $('#tbodyItems').empty();
        let total = 0;
        items.forEach((it) => {
            const subtotal = Number(it.subtotal || (it.cantidad * (it.precio_unitario || it.precio)));
            total += subtotal;
            tbody.append(`
                <tr>
                    <td>${it.producto_nombre || it.nombre} ${it.nota ? `<br><small class="text-muted">(${it.nota})</small>` : ''}</td>
                    <td class="text-end">${it.cantidad}</td>
                    <td class="text-end">${formatear(subtotal)}</td>
                </tr>
            `);
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
                    const $item = $(`
                        <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                            <div>
                                <span class="fw-bold">${p.nombre}</span><br>
                                <small class="text-muted">${p.codigo || ''}</small>
                            </div>
                            <span class="badge bg-primary rounded-pill">${formatear(p.precio_unidad)}</span>
                        </button>
                    `);
                    $item.on('click', () => {
                        window.seleccionarProducto(p);
                        $list.hide();
                        $('#buscarProductoMesa').val('');
                    });
                    $list.append($item);
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
                body: JSON.stringify({ forma_pago: formaPago, cliente_id: 1 })
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