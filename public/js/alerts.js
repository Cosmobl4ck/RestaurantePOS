// Función para mostrar alertas personalizadas
function mostrarAlerta(mensaje, tipo = 'success') {
    const alertaDiv = document.createElement('div');
    alertaDiv.className = `custom-alert ${tipo}`;

    const content = document.createElement('div');
    content.className = 'alert-content';
    const icon = document.createElement('i');
    icon.className = `bi ${tipo === 'success' ? 'bi-check-circle' :
                      tipo === 'error' ? 'bi-x-circle' :
                      'bi-exclamation-triangle'} me-2`;
    content.append(icon, document.createTextNode(String(mensaje ?? '')));

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn-close btn-close-white ms-3';
    close.setAttribute('aria-label', 'Cerrar');
    close.addEventListener('click', () => alertaDiv.remove());

    alertaDiv.append(content, close);
    document.body.appendChild(alertaDiv);
    setTimeout(() => alertaDiv.remove(), 5000);
}

// Reemplazar el alert nativo
window.alert = function(mensaje) {
    mostrarAlerta(mensaje, 'warning');
};
