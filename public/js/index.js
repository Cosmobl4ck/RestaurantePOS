$(document).ready(function() {
    // 1. Configuración global de SweetAlert2 (Se mantiene igual, está excelente)
    const swalBootstrap = Swal.mixin({
        customClass: {
            container: 'my-swal',
            popup: 'shadow-sm border-0 rounded-4',
            header: 'border-bottom-0',
            title: 'fs-5 fw-semibold',
            confirmButton: 'btn btn-primary px-4 py-2',
            cancelButton: 'btn btn-outline-secondary px-4 py-2 ms-2'
        },
        buttonsStyling: false
    });

    // 2. Inicialización de variables (Añadimos restauranteId solo para logs, la sesión manda)
    let productosFactura = [];
    let totalFactura = 0;

    // 3. Inicializar Select2 con las rutas SAAS blindadas
    $('.select2').select2({
        width: '100%',
        ajax: {
            url: function() {
                // Ajustamos las URLs a las que blindamos en los archivos de routes/
                return ($(this).attr('id') === 'cliente') ? '/clientes/buscar' : '/productos/buscar';
            },
            dataType: 'json',
            delay: 250,
            data: function(params) {
                return { q: params.term };
            },
            processResults: function(data) {
                return {
                    results: data.map(item => ({
                        id: item.id,
                        text: item.nombre,
                        ...item
                    }))
                };
            },
            cache: true
        },
        minimumInputLength: 1,
        templateResult: formatRepo
    });

    function formatRepo(item) {
        if (!item.id) return item.text;
        if (item.codigo) { // Render para Productos
            return $(`
                <div class="d-flex justify-content-between">
                    <span><strong>${item.codigo}</strong> - ${item.nombre}</span>
                    <span class="badge ${item.stock <= 0 ? 'bg-danger' : 'bg-success'}">Stock: ${item.stock}</span>
                </div>
                <div class="small text-muted">Precio: $${item.precio_unidad}</div>
            `);
        } else { // Render para Clientes
            return $(`
                <div><strong>${item.nombre}</strong></div>
                <div class="small text-muted">${item.telefono || 'Sin teléfono'}</div>
            `);
        }
    }

    // 4. Lógica de agregar producto a la lista (Frontend)
    $('#agregarProducto').click(function() {
        const producto = $('#producto').select2('data')[0];
        const cantidad = parseFloat($('#cantidad').val());
        const precio = parseFloat($('#precio').val());

        if (!producto || !cantidad || cantidad <= 0) {
            return swalBootstrap.fire('Atención', 'Selecciona un producto y cantidad válida', 'warning');
        }

        // Validar stock solo si el producto lo requiere (Lógica que pusimos en el SaaS)
        if (producto.stock < cantidad) {
            return swalBootstrap.fire('Sin Stock', `Solo quedan ${producto.stock} unidades`, 'error');
        }

        const subtotal = cantidad * precio;

        productosFactura.push({
            producto_id: producto.id,
            nombre: producto.nombre,
            cantidad: cantidad,
            precio: precio,
            subtotal: subtotal
        });

        actualizarTabla();
        limpiarCamposProducto();
    });

    function actualizarTabla() {
        const tbody = $('#productosTabla');
        tbody.empty();
        totalFactura = 0;

        productosFactura.forEach((item, index) => {
            totalFactura += item.subtotal;
            tbody.append(`
                <tr>
                    <td>${item.nombre}</td>
                    <td>${item.cantidad}</td>
                    <td>$${item.precio.toFixed(2)}</td>
                    <td>$${item.subtotal.toFixed(2)}</td>
                    <td><button class="btn btn-sm btn-danger" onclick="quitar(${index})">x</button></td>
                </tr>
            `);
        });
        $('#totalFactura').text(totalFactura.toFixed(2));
    }

    // 5. EL GRAN FINAL: ENVIAR LA FACTURA AL BACKEND SAAS
    $('#generarFactura').click(async function() {
        const clienteId = $('#cliente').val();
        const formaPago = $('#formaPago').val();

        if (!clienteId || productosFactura.length === 0) {
            return swalBootstrap.fire('Error', 'Falta cliente o productos', 'error');
        }

        const datosVenta = {
            cliente_id: clienteId,
            forma_pago: formaPago,
            productos: productosFactura, // Arreglo de {producto_id, cantidad, precio, subtotal}
            total: totalFactura
        };

        try {
            // Esta ruta debe coincidir con la que creamos en ventas.js o caja.js
            const response = await $.ajax({
                url: '/facturas/crear', 
                method: 'POST',
                data: JSON.stringify(datosVenta),
                contentType: 'application/json'
            });

            swalBootstrap.fire('¡Éxito!', 'Venta realizada correctamente', 'success').then(() => {
                location.reload(); // Limpiamos todo
            });

        } catch (error) {
            const msg = error.responseJSON ? error.responseJSON.error : 'Error al procesar venta';
            swalBootstrap.fire('Error', msg, 'error');
        }
    });

    // Helpers
    function limpiarCamposProducto() {
        $('#producto').val(null).trigger('change');
        $('#cantidad').val('');
        $('#precio').val('');
    }

    window.quitar = (index) => {
        productosFactura.splice(index, 1);
        actualizarTabla();
    };
});