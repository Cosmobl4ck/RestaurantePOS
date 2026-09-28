document.addEventListener('DOMContentLoaded', function() {
    const modal = new bootstrap.Modal(document.getElementById('nuevoProductoModal'));
    const formProducto = document.getElementById('formProducto');
    const buscarProducto = document.getElementById('buscarProducto');
    
    // Referencias a los campos
    const categoriaSelect = document.getElementById('categoria');
    const stockContainer = document.getElementById('stockContainer');
    const stockInput = document.getElementById('stock');
    
    // NUEVAS REFERENCIAS PARA STOCK MÍNIMO
    const stockMinimoContainer = document.getElementById('stockMinimoContainer');
    const stockMinimoInput = document.getElementById('stock_minimo');
    
    let timeoutId;

    // 1. LÓGICA VISUAL: Mostrar/Ocultar Stock y Stock Mínimo según Categoría
    categoriaSelect.addEventListener('change', function() {
        if (this.value === 'bar') {
            // Mostrar ambos contenedores
            stockContainer.classList.remove('d-none'); 
            stockMinimoContainer.classList.remove('d-none'); 
            
            // Hacer campos obligatorios
            stockInput.setAttribute('required', 'true');
            stockMinimoInput.setAttribute('required', 'true');
        } else {
            // Ocultar ambos
            stockContainer.classList.add('d-none');
            stockMinimoContainer.classList.add('d-none');
            
            // Quitar obligatoriedad y resetear
            stockInput.removeAttribute('required');
            stockMinimoInput.removeAttribute('required');
            stockInput.value = 0;
            stockMinimoInput.value = 0;
        }
    });
    
    // 2. BUSCADOR (Debounce)
    buscarProducto.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        clearTimeout(timeoutId);
        
        if (!searchTerm) {
            document.querySelectorAll('#productosTabla tr').forEach(row => row.style.display = '');
            return;
        }
        
        timeoutId = setTimeout(() => {
            document.querySelectorAll('#productosTabla tr').forEach(row => {
                const codigo = row.cells[0].textContent.toLowerCase();
                const nombre = row.cells[1].textContent.toLowerCase();
                row.style.display = (codigo.includes(searchTerm) || nombre.includes(searchTerm)) ? '' : 'none';
            });
        }, 300);
    });

    // 3. TECLAS RÁPIDAS (Ctrl+B, Ctrl+N, /)
    document.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.ctrlKey || e.metaKey) { 
            switch(e.key.toLowerCase()) {
                case 'b': e.preventDefault(); buscarProducto.focus(); break;
                case 'n': 
                    e.preventDefault(); 
                    modal.show(); 
                    setTimeout(() => document.getElementById('codigo').focus(), 500);
                    break;
            }
        } else if (e.key === '/') {
            e.preventDefault();
            buscarProducto.focus();
        }
    });

    // 4. GUARDAR PRODUCTO (POST / PUT)
    document.getElementById('guardarProducto').addEventListener('click', async function() {
        if (!formProducto.checkValidity()) {
            formProducto.reportValidity();
            return;
        }

        const esBar = document.getElementById('categoria').value === 'bar';

        const productoData = {
            codigo: document.getElementById('codigo').value,
            nombre: document.getElementById('nombre').value,
            precio_unidad: parseFloat(document.getElementById('precioUnidad').value) || 0,
            precio_kg: 0, 
            precio_libra: 0,
            categoria: document.getElementById('categoria').value,
            // Enviamos stock y stock_minimo solo si es Bar
            stock: esBar ? (parseFloat(document.getElementById('stock').value) || 0) : 0,
            stock_minimo: esBar ? (parseFloat(document.getElementById('stock_minimo').value) || 0) : 0
        };

        const productoId = document.getElementById('productoId').value;
        const url = productoId ? `/productos/${productoId}` : '/productos';
        const method = productoId ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(productoData)
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Error al guardar el producto');
            }

            location.reload();
        } catch (error) {
            alert(error.message);
        }
    });

    // 5. LIMPIAR FORMULARIO AL ABRIR PARA NUEVO
    document.getElementById('nuevoProductoModal').addEventListener('show.bs.modal', function(event) {
        // Si el evento no viene de un botón (ej: se disparó programáticamente), no limpiar
        if (event.relatedTarget && event.relatedTarget.getAttribute('data-bs-target') === '#nuevoProductoModal') {
            document.getElementById('productoId').value = '';
            formProducto.reset();
            
            // Resetear visualización (Ocultar stock y alerta por defecto en Cocina)
            stockContainer.classList.add('d-none');
            stockMinimoContainer.classList.add('d-none');
            stockInput.removeAttribute('required');
            stockMinimoInput.removeAttribute('required');
            
            document.getElementById('categoria').value = 'cocina';
            document.getElementById('modalTitle').textContent = 'Nuevo Producto';
            
            setTimeout(() => document.getElementById('codigo').focus(), 500);
        }
    });
    
    // Tooltips de Bootstrap
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
});

// 6. EXPORTACIONES (Excel, Plantilla, Bar)
function configurarBotonesExportar() {
    const acciones = {
        'btnExportarExcel': '/productos/exportar',
        'btnDescargarPlantilla': '/productos/plantilla',
        'btnExportarBar': '/productos/exportar-bar'
    };

    for (const [id, url] of Object.entries(acciones)) {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => window.location.href = url);
        }
    }
}
configurarBotonesExportar();

// 7. FUNCIÓN EDITAR (Carga datos de la BD al Modal)
function editarProducto(id) {
    fetch(`/productos/${id}`)
        .then(response => response.json())
        .then(producto => {
            document.getElementById('productoId').value = producto.id;
            document.getElementById('codigo').value = producto.codigo;
            document.getElementById('nombre').value = producto.nombre;
            document.getElementById('precioUnidad').value = producto.precio_unidad;
            
            const cat = producto.categoria || 'cocina';
            document.getElementById('categoria').value = cat;

            const stockContainer = document.getElementById('stockContainer');
            const stockMinimoContainer = document.getElementById('stockMinimoContainer');
            
            if (cat === 'bar') {
                stockContainer.classList.remove('d-none');
                stockMinimoContainer.classList.remove('d-none');
                
                document.getElementById('stock').value = producto.stock || 0;
                document.getElementById('stock_minimo').value = producto.stock_minimo || 0;
                
                document.getElementById('stock').setAttribute('required', 'true');
                document.getElementById('stock_minimo').setAttribute('required', 'true');
            } else {
                stockContainer.classList.add('d-none');
                stockMinimoContainer.classList.add('d-none');
                document.getElementById('stock').value = 0;
                document.getElementById('stock_minimo').value = 0;
            }
            
            document.getElementById('modalTitle').textContent = 'Editar Producto';
            const modal = new bootstrap.Modal(document.getElementById('nuevoProductoModal'));
            modal.show();
        })
        .catch(error => {
            console.error(error);
            alert('Error al cargar los datos del producto');
        });
}

// 8. FUNCIÓN ELIMINAR
function eliminarProducto(id) {
    if (!confirm('¿Está seguro de eliminar este producto?')) return;

    fetch(`/productos/${id}`, { method: 'DELETE' })
        .then(response => {
            if (!response.ok) throw new Error('Error al eliminar');
            location.reload();
        })
        .catch(error => alert(error.message));
}