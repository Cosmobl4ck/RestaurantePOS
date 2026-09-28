$(document).ready(function() {
    
    // 1. GENERAR CALCULADORA DINÁMICA
    const container = $('#calculadoraContainer');
    let html = '<div class="row g-2">';
    
    // Definidas en el HTML: denominaciones
    denominaciones.forEach(d => {
        const label = d.label || (d.tipo === 'billete' ? `Billete $${d.val}` : `Moneda $${d.val}`);
        html += `
            <div class="col-6 col-md-4 col-lg-3">
                <label class="small text-muted">${label}</label>
                <div class="input-group">
                    <span class="input-group-text bg-white text-success fw-bold">$</span>
                    <input type="number" class="form-control input-dinero" 
                           data-valor="${d.val}" placeholder="0" min="0">
                </div>
                <div class="small text-end text-primary fw-bold subtotal-display">$0.00</div>
            </div>
        `;
    });
    
    html += '</div>';
    html += '<div class="mt-4 p-3 bg-light rounded border text-center">';
    html += '<h3>Total Contado: <span id="granTotal" class="text-success">$0.00</span></h3>';
    html += '</div>';
    
    container.html(html);

    // 2. EVENTO: CALCULAR MIENTRAS ESCRIBE
    $('.input-dinero').on('input', function() {
        let total = 0;
        
        $('.input-dinero').each(function() {
            const cantidad = parseFloat($(this).val()) || 0;
            const valor = parseFloat($(this).data('valor'));
            const subtotal = cantidad * valor;
            
            // Mostrar subtotal pequeño debajo del input
            $(this).parent().next('.subtotal-display').text('$' + subtotal.toFixed(2));
            
            total += subtotal;
        });

        $('#granTotal').text('$' + total.toFixed(2));
        $('#granTotal').data('val', total);
    });

    // 3. RECOLECTAR DATOS
    function obtenerDetalles() {
        let detalles = {};
        let total = 0;
        $('.input-dinero').each(function() {
            const val = $(this).data('valor');
            const cant = $(this).val();
            if(cant > 0) {
                detalles[val] = cant; // Ej: "20": "5" (5 billetes de 20)
                total += (val * cant);
            }
        });
        return { total, detalles };
    }

    // 4. GUARDAR APERTURA
    $('#btnGuardarApertura').click(async function() {
        const info = obtenerDetalles();
        const turno = $('#selectTurno').val();
        
        if(info.total === 0) {
            const confirm = await Swal.fire({title:'¿Abrir en $0?', text:'¿Seguro que la caja está vacía?', showCancelButton:true});
            if(!confirm.isConfirmed) return;
        }

        $.post('/caja/abrir', { 
            turno: turno, 
            monto_inicial: info.total, 
            detalles: info.detalles 
        }, function() {
            Swal.fire('Caja Abierta', 'Turno iniciado correctamente', 'success').then(() => location.reload());
        });
    });

    // 5. GUARDAR CIERRE (CORTE)
    $('#btnGuardarCierre').click(async function() {
        const info = obtenerDetalles();
        const cajaId = $(this).data('id');

        const confirm = await Swal.fire({
            title: '¿Confirmar Corte?',
            html: `Total contado: <strong>$${info.total.toFixed(2)}</strong>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, Cerrar Caja'
        });

        if (confirm.isConfirmed) {
            $.post('/caja/cerrar', {
                caja_id: cajaId,
                monto_final: info.total,
                detalles: info.detalles
            }, function(res) {
                // Mensaje diferente según si cuadró o no
                let titulo = 'Corte Realizado';
                let icon = 'success';
                let msg = 'Caja cerrada correctamente';

                if (res.diferencia < 0) {
                    titulo = '¡FALTANTE DETECTADO!';
                    icon = 'error';
                    msg = `Faltan $${Math.abs(res.diferencia).toFixed(2)}`;
                } else if (res.diferencia > 0) {
                    titulo = 'Sobrante detectado';
                    icon = 'info';
                    msg = `Sobran $${res.diferencia.toFixed(2)}`;
                }

                Swal.fire(titulo, msg, icon).then(() => location.reload());
            });
        }
    });
});