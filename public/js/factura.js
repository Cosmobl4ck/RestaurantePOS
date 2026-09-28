/* ===============================
   VER DETALLE FACTURA
   Llama al endpoint del servidor en lugar de Supabase directamente
================================*/
async function verDetalle(id) {
    try {
        Swal.fire({
            title: 'Cargando detalle...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const response = await fetch(`/facturas/detalle/${id}`);
        if (!response.ok) throw new Error(`Error ${response.status}`);

        const data = await response.json();
        if (!data || !data.factura) throw new Error('Respuesta inválida del servidor');

        Swal.close();

        const info = data.factura;
        const items = data.detalles || [];

        const fCierre = new Date(info.fecha_cierre);

        let htmlDetalle = `
            <div id="captura-detalle" style="padding: 30px; background: white; font-family: 'Segoe UI', Roboto, sans-serif; width: 420px; color: #000; border: 1px solid #eee;">
                <div style="text-align: center; margin-bottom: 10px;">
                    <img src="/uploads/MarrocosPOS_ico250px.png" style="max-width: 100px; height: auto;" alt="Logo" onerror="this.style.display='none'">
                </div>
                <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px dashed #eee; padding-bottom: 15px;">
                    <h3 style="margin: 0; font-weight: 900; letter-spacing: 1px; text-transform: uppercase;">MARROCOS POS</h3>
                    <div style="margin-top: 5px; color: #666; font-size: 0.9rem;">Factura #${id}</div>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="font-weight: bold; color: #444;">Cliente:</span>
                    <span>${info.cliente_nombre}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                    <span style="font-weight: bold; color: #444;">Forma de pago:</span>
                    <span style="text-transform: capitalize;">${info.forma_pago || '-'}</span>
                </div>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <thead>
                        <tr style="border-bottom: 2px solid #000; font-size: 0.85rem; text-transform: uppercase;">
                            <th style="padding: 8px 0; text-align: left; width: 15%;">Cant</th>
                            <th style="padding: 8px 0; text-align: left; width: 60%;">Producto</th>
                            <th style="padding: 8px 0; text-align: right; width: 25%;">Total</th>
                        </tr>
                    </thead>
                    <tbody style="font-size: 0.95rem;">
                        ${items.length === 0
                            ? '<tr><td colspan="3" style="text-align:center; padding: 12px; color: #999;">Sin productos registrados</td></tr>'
                            : items.map(item => `
                                <tr style="border-bottom: 1px solid #f2f2f2;">
                                    <td style="padding: 10px 0;">${Math.round(item.cantidad)}</td>
                                    <td style="padding: 10px 0;">${item.producto_nombre}</td>
                                    <td style="padding: 10px 0; text-align: right; font-weight: bold;">$${Number(item.subtotal).toLocaleString('es-CO')}</td>
                                </tr>
                            `).join('')
                        }
                    </tbody>
                </table>
                <div style="display: flex; justify-content: space-between; border-top: 2px solid #000; padding-top: 15px; margin-bottom: 20px; font-size: 1.3rem; font-weight: 900;">
                    <span>TOTAL:</span>
                    <span>$${items.reduce((acc, item) => acc + Number(item.subtotal), 0).toLocaleString('es-CO')}</span>
                </div>
                <div style="text-align: center; padding-top: 10px; border-top: 1px dashed #ccc; font-size: 0.75rem; color: #777;">
                    ${fCierre.toLocaleString('es-SV')} &nbsp;•&nbsp; Sistema MarrocosPOS<br>
                    ¡Gracias por su preferencia!
                </div>
            </div>
        `;

        Swal.fire({
            html: htmlDetalle,
            width: '450px',
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-download"></i> Descargar Imagen',
            cancelButtonText: 'Cerrar',
            confirmButtonColor: '#198754'
        }).then((result) => {
            if (result.isConfirmed) descargarImagen(id);
        });

    } catch (err) {
        console.error('ERROR verDetalle:', err);
        Swal.fire('Error', 'No se pudo cargar el detalle. ' + err.message, 'error');
    }
}

function descargarImagen(id) {
    const area = document.getElementById('captura-detalle');
    if (!area) return;
    html2canvas(area).then(canvas => {
        const link = document.createElement('a');
        link.download = `Factura_${id}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    });
}

async function enviarWhatsApp(id, cliente, total) {
    const { value: telefono } = await Swal.fire({
        title: 'Enviar Factura por WhatsApp',
        input: 'tel',
        inputLabel: 'Número de teléfono (con código de país)',
        inputPlaceholder: 'Ej: 50370000000',
        showCancelButton: true,
        confirmButtonText: 'Preparar Mensaje',
        confirmButtonColor: '#25D366',
        cancelButtonText: 'Cancelar'
    });

    if (telefono) {
        const totalFormateado = Number(total).toLocaleString('es-CO');
        const mensaje = encodeURIComponent(
            `*¡Hola, ${cliente}!* 👋\n\n` +
            `Adjuntamos el detalle de tu *Factura #${id}* por un valor de *$${totalFormateado}*.\n\n` +
            `¡Gracias por tu compra! 😊`
        );
        descargarImagen(id);
        window.open(`https://wa.me/${telefono}?text=${mensaje}`, '_blank');
        Swal.fire({
            icon: 'info',
            title: 'Imagen descargada',
            text: 'La imagen de la factura se ha descargado. Adjúntala en el chat de WhatsApp.',
            confirmButtonColor: '#25D366'
        });
    }
}
