// ================================================================
// MÃ“DULO DE DESPERDICIOS - JavaScript Frontend
// ================================================================

/**
 * NOTAS DE IMPLEMENTACIÃ“N:
 * - Este archivo maneja toda la interactividad del panel de desperdicios
 * - NO afecta el inventario (tabla productos.stock)
 * - Solo registra y genera reportes
 * - Los datos se almacenan en tabla "desperdicios"
 */


function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

// ================================================================
// 1. CARGAR LISTA DE DESPERDICIOS CON FILTROS
// ================================================================

async function cargarDesperdicios(filtros = {}) {
    try {
        const params = new URLSearchParams(filtros);
        const resp = await fetch(`/desperdicios/api/lista?${params}`);
        
        if (!resp.ok) throw new Error('Error al cargar los datos del servidor');
        
        const desperdicios = await resp.json();
        const tbody = document.querySelector('table tbody');
        
        if (!tbody) return; 

        // 1. Si no hay registros, mostrar mensaje de vacÃ­o
        if (desperdicios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Sin registros encontrados</td></tr>';
            return;
        }

        // 2. Si hay registros, construir las filas de la tabla
        let htmlRows = '';
        desperdicios.forEach(d => {
            const fecha = new Date(d.created_at).toLocaleDateString('es-SV');
            const hora = new Date(d.created_at).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });

            htmlRows += `
                <tr>
                    <td>
                        <small>${fecha} ${hora}</small>
                    </td>
                    <td><strong>${escapeHtml(d.productos?.nombre || 'Producto eliminado')}</strong></td>
                    <td>${escapeHtml(d.cantidad)} ${escapeHtml(d.unidad_medida || 'UND')}</td>
                    <td><span class="badge bg-secondary">${escapeHtml(d.motivo)}</span></td>
                    <td>${escapeHtml(d.notas || '-')}</td>
                    <td>${escapeHtml(d.usuarios?.nombre || '-')}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-danger btn-eliminar" data-id="${d.id}">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        // 3. Inyectar el HTML en la tabla
        tbody.innerHTML = htmlRows;

        // 4. Â¡IMPORTANTE! Re-vincular los eventos de los botones eliminar
        // Como el HTML es nuevo, los listeners viejos desaparecieron.
        document.querySelectorAll('.btn-eliminar').forEach(btn => {
            btn.onclick = () => eliminarDesperdicio(btn.dataset.id);
        });

    } catch (err) {
        console.error('Error en cargarDesperdicios:', err);
        Swal.fire({ icon: 'error', title: 'Error de carga', text: err.message });
    }
}

// ================================================================
// 2. REGISTRAR NUEVO DESPERDICIO
// ================================================================

async function registrarDesperdicio(datos) {
    try {
        const resp = await fetch('/desperdicios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                producto_id: parseInt(datos.producto_id),
                cantidad: parseFloat(datos.cantidad),
                unidad_medida: datos.unidad_medida || 'UND',
                motivo: datos.motivo,
                notas: datos.notas || null
            })
        });

        if (!resp.ok) {
            const error = await resp.json();
            throw new Error(error.error || 'Error al registrar');
        }

        const result = await resp.json();
        
        Swal.fire({
            icon: 'success',
            title: 'Registrado',
            text: result.message,
            timer: 2000,
            showConfirmButton: false
        });

        // Recargar la tabla
        setTimeout(() => location.reload(), 1500);
        
        return result;
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
}

// ================================================================
// 3. ELIMINAR REGISTRO (Solo si es reciente)
// ================================================================

async function eliminarDesperdicio(id) {
    const { isConfirmed } = await Swal.fire({
        title: 'Â¿Eliminar registro?',
        text: 'Solo se pueden eliminar registros con menos de 1 hora de antigÃ¼edad',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'SÃ­, eliminar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#dc3545'
    });

    if (!isConfirmed) return;

    try {
        const resp = await fetch(`/desperdicios/${id}`, {
            method: 'DELETE'
        });

        if (!resp.ok) {
            const error = await resp.json();
            throw new Error(error.error || 'No se puede eliminar');
        }

        Swal.fire({
            icon: 'success',
            title: 'Eliminado',
            timer: 1500,
            showConfirmButton: false
        });

        setTimeout(() => location.reload(), 1000);
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
}

// ================================================================
// 4. GENERAR REPORTE DE PERÃODO
// ================================================================

async function generarReporte(desde, hasta) {
    try {
        Swal.fire({ title: 'Generando reporte...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const params = new URLSearchParams({ desde, hasta });
        const resp = await fetch(`/desperdicios/reporte?${params}`);

        if (!resp.ok) throw new Error('Error al generar reporte');

        const data = await resp.json();

        // Construir HTML del reporte
        let htmlReporte = `
            <div style="text-align: left; padding: 20px; background: #f8f9fa; border-radius: 8px;">
                <h4>ðŸ“Š Reporte de Desperdicios</h4>
                <p><strong>PerÃ­odo:</strong> ${data.periodo.desde} a ${data.periodo.hasta}</p>
                
                <hr>
                
                <h5>Resumen General</h5>
                <ul>
                    <li><strong>Total registros:</strong> ${data.resumen.total_lineas}</li>
                    <li><strong>Cantidad total:</strong> ${data.resumen.total_cantidad}</li>
                    <li><strong>Productos afectados:</strong> ${data.resumen.productos_afectados}</li>
                </ul>
                
                <hr>
                
                <h5>Desperdicio por Producto</h5>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr style="background: #e9ecef; border-bottom: 1px solid #dee2e6;">
                        <th style="padding: 8px; text-align: left;">Producto</th>
                        <th style="padding: 8px; text-align: center;">Cantidad</th>
                        <th style="padding: 8px; text-align: center;">Registros</th>
                    </tr>
                    ${data.por_producto.map(p => `
                        <tr style="border-bottom: 1px solid #dee2e6;">
                            <td style="padding: 8px;">${p.nombre}</td>
                            <td style="padding: 8px; text-align: center;"><strong>${p.cantidad} ${p.unidad}</strong></td>
                            <td style="padding: 8px; text-align: center;">${p.movimientos}</td>
                        </tr>
                    `).join('')}
                </table>
                
                <hr>
                
                <h5>Desperdicios por Motivo</h5>
                <ul>
                    ${Object.entries(data.por_motivo).map(([motivo, datos]) => `
                        <li><strong>${motivo.toUpperCase()}:</strong> ${datos.count} registros (${datos.cantidad})</li>
                    `).join('')}
                </ul>
            </div>
        `;

        Swal.fire({
            title: 'Reporte de Desperdicios',
            html: htmlReporte,
            width: '700px',
            confirmButtonText: 'Descargar como PDF',
            showCancelButton: true,
            cancelButtonText: 'Cerrar'
        }).then(result => {
            if (result.isConfirmed) {
                descargarReportePDF(data);
            }
        });

    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
}

// ================================================================
// 5. DESCARGAR REPORTE COMO PDF
// ================================================================

function descargarReportePDF(data) {
    // Nota: Para usar esto necesitas tener jsPDF instalado
    // pnpm install jspdf
    
    // Alternativa simple: generar un CSV
    let csv = 'Producto,Cantidad,Unidad,Motivo,Fecha,Notas\n';
    
    data.detalle.forEach(d => {
        const fecha = new Date(d.created_at).toLocaleDateString('es-SV');
        csv += `"${d.productos.nombre}","${escapeHtml(d.cantidad)}","${d.unidad_medida}","${escapeHtml(d.motivo)}","${fecha}","${d.notas || ''}"\n`;
    });

    // Crear blob y descargar
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `desperdicios_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
}

// ================================================================
// 6. GRÃFICAS DE DESPERDICIOS (Con Chart.js si estÃ¡ disponible)
// ================================================================

async function generarGrafica(tipo = 'producto') {
    try {
        const resp = await fetch('/desperdicios/reporte');
        const data = await resp.json();

        let labels, valores;

        if (tipo === 'producto') {
            labels = data.por_producto.map(p => p.nombre);
            valores = data.por_producto.map(p => parseFloat(p.cantidad));
        } else if (tipo === 'motivo') {
            labels = Object.keys(data.por_motivo);
            valores = Object.values(data.por_motivo).map(m => m.count);
        }

        // Si hay Chart.js disponible
        if (typeof Chart !== 'undefined') {
            const ctx = document.getElementById('chartDesperdicios');
            if (ctx) {
                new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Desperdicios',
                            data: valores,
                            backgroundColor: 'rgba(226, 75, 74, 0.5)',
                            borderColor: 'rgba(226, 75, 74, 1)',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: { legend: { position: 'top' } },
                        scales: { y: { beginAtZero: true } }
                    }
                });
            }
        }
    } catch (err) {
        console.error('Error al generar grÃ¡fica:', err);
    }
}

// ================================================================
// 7. VALIDACIONES DE FORMULARIO
// ================================================================

function validarFormularioDesperdicio(datos) {
    const errores = [];

    if (!datos.producto_id) errores.push('Debes seleccionar un producto');
    if (!datos.cantidad || parseFloat(datos.cantidad) <= 0) errores.push('La cantidad debe ser mayor a 0');
    if (!datos.motivo) errores.push('Debes seleccionar un motivo');

    return {
        valido: errores.length === 0,
        errores: errores
    };
}

// ================================================================
// 8. EVENT LISTENERS (InicializaciÃ³n)
// ================================================================

document.addEventListener('DOMContentLoaded', function() {
    // Cargar desperdicios al iniciar
    cargarDesperdicios();

    // Formulario de registro
   const formRegistrar = document.getElementById('formRegistrar');
    if (formRegistrar) {
        formRegistrar.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // Buscamos si existe el campo unidad_medida, si no, usamos 'UND' por defecto
            const unidadInput = this.querySelector('[name="unidad_medida"]');
            const unidadValor = unidadInput ? unidadInput.value : 'UND';

            // Armamos el objeto con cuidado de que no falte nada
            const datos = {
                producto_id: this.querySelector('[name="producto_id"]').value,
                cantidad: this.querySelector('[name="cantidad"]').value,
                unidad_medida: unidadValor, // <-- AquÃ­ estaba el error
                motivo: this.querySelector('[name="motivo"]').value,
                notas: this.querySelector('[name="notas"]').value
            };

            const validacion = validarFormularioDesperdicio(datos);
            if (!validacion.valido) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Faltan datos',
                    html: validacion.errores.map(e => `<li>${e}</li>`).join('')
                });
                return;
            }

            await registrarDesperdicio(datos);
        });
    }

    // Botones de eliminar
    document.querySelectorAll('.btn-eliminar').forEach(btn => {
        btn.addEventListener('click', function() {
            eliminarDesperdicio(this.dataset.id);
        });
    });

    // BotÃ³n de reporte
    const btnReporte = document.getElementById('btnReporte');
    if (btnReporte) {
        btnReporte.addEventListener('click', function() {
            generarReporte(
                document.querySelector('input[name="desde"]').value || '',
                document.querySelector('input[name="hasta"]').value || ''
            );
        });
    }
});

// ================================================================
// NOTAS IMPORTANTES
// ================================================================

/**
 * Este mÃ³dulo de desperdicios:
 * 
 * âœ“ Registra pÃ©rdidas sin afectar el stock
 * âœ“ Permite filtrar por fecha, producto, motivo
 * âœ“ Genera reportes por perÃ­odo
 * âœ“ Solo permite eliminar registros recientes (< 1 hora)
 * âœ“ Usa RLS de Supabase para seguridad
 * âœ“ Rastrea quiÃ©n registrÃ³ cada desperdicio
 * 
 * Casos de uso:
 * - Vencimientos detectados en almacÃ©n
 * - Productos daÃ±ados en transporte
 * - Merma normal en cocina
 * - Accidentes (caÃ­das, derrames, etc.)
 * - Otros problemas
 */

