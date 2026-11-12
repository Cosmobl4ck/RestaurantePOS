/**
 * Catálogo de eventos de auditoría del POS.
 *
 * Las claves se guardan tal cual en `auditoria_eventos.accion`. Mantenerlas
 * estables permite filtrar y crear reportes sin depender de textos visibles.
 */
const AUDIT_ACTION_CATALOG = Object.freeze([
    { key: 'sesion.iniciar', label: 'Inicio de sesión', group: 'Seguridad', tone: 'info' },
    { key: 'sesion.cerrar', label: 'Cierre de sesión', group: 'Seguridad', tone: 'info' },
    { key: 'usuario.crear', label: 'Usuario creado', group: 'Personal', tone: 'success' },
    { key: 'producto.crear', label: 'Producto creado', group: 'Menú', tone: 'success' },
    { key: 'producto.actualizar', label: 'Producto actualizado', group: 'Menú', tone: 'info' },
    { key: 'producto.eliminar', label: 'Producto eliminado', group: 'Menú', tone: 'danger' },
    { key: 'producto.importar', label: 'Menú importado', group: 'Menú', tone: 'info' },
    { key: 'caja.abrir', label: 'Caja abierta', group: 'Caja', tone: 'success' },
    { key: 'caja.cerrar', label: 'Caja cerrada', group: 'Caja', tone: 'info' },
    { key: 'pedido.facturar', label: 'Pedido facturado', group: 'Ventas', tone: 'success' },
    { key: 'pedido.cancelar', label: 'Pedido cancelado', group: 'Ventas', tone: 'danger' },
    { key: 'pedido.mover', label: 'Pedido movido', group: 'Mesas', tone: 'info' },
    { key: 'factura.anular', label: 'Factura anulada', group: 'Ventas', tone: 'danger' },
    { key: 'configuracion.actualizar', label: 'Configuración actualizada', group: 'Negocio', tone: 'info' }
]);

const ACTION_MAP = new Map(AUDIT_ACTION_CATALOG.map((item) => [item.key, item]));

const AUDIT_ACTION_GROUPS = Object.freeze(
    AUDIT_ACTION_CATALOG.reduce((groups, item) => {
        let group = groups.find((entry) => entry.nombre === item.group);
        if (!group) {
            group = { nombre: item.group, items: [] };
            groups.push(group);
        }
        group.items.push(item);
        return groups;
    }, [])
);

function getAuditAction(key) {
    return ACTION_MAP.get(String(key || '')) || null;
}

function getAuditActionLabel(key) {
    return getAuditAction(key)?.label || String(key || 'Evento');
}

function getAuditActionTone(key) {
    return getAuditAction(key)?.tone || 'info';
}

function isAuditAction(key) {
    return ACTION_MAP.has(String(key || ''));
}

module.exports = {
    AUDIT_ACTION_CATALOG,
    AUDIT_ACTION_GROUPS,
    getAuditAction,
    getAuditActionLabel,
    getAuditActionTone,
    isAuditAction
};
