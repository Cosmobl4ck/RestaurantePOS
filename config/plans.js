/**
 * Catálogo central de planes comerciales.
 *
 * Este archivo es la fuente de verdad para códigos, etiquetas, features,
 * límites y precios. La base de datos puede sobrescribir estos valores
 * (tablas planes, plan_features y plan_limits), pero si la migración aún
 * no está aplicada el sistema sigue funcionando con este catálogo.
 */

const PLAN_CODES = Object.freeze(['trial', 'basic', 'premium', 'gold']);

const PAID_PLAN_CODES = Object.freeze(['basic', 'premium', 'gold']);

const PLAN_LABELS = Object.freeze({
  trial: 'Trial',
  basic: 'Básico',
  premium: 'Premium',
  gold: 'Gold'
});

const FEATURE_CATALOG = Object.freeze([
  { key: 'pos.mesas', label: 'POS de mesas y mostrador', group: 'Operación' },
  { key: 'pos.pedidos', label: 'Pedidos, comandas y notas', group: 'Operación' },
  { key: 'pos.facturar', label: 'Facturación de pedidos', group: 'Operación' },
  { key: 'pos.cancelar', label: 'Cancelación de pedidos', group: 'Operación' },
  { key: 'pos.mover_pedido', label: 'Mover pedidos entre mesas', group: 'Operación' },
  { key: 'menu.productos', label: 'Menú y productos', group: 'Menú' },
  { key: 'menu.ficha', label: 'Ficha de producto: descripción e ingredientes', group: 'Menú' },
  { key: 'menu.alergenos', label: 'Alérgenos y aviso de alergia', group: 'Menú' },
  { key: 'menu.tiempo_preparacion', label: 'Tiempo de preparación', group: 'Menú' },
  { key: 'kds.cocina', label: 'Monitor de cocina', group: 'Cocina y bar' },
  { key: 'kds.bar', label: 'Monitor de bar', group: 'Cocina y bar' },
  { key: 'kds.tiempos', label: 'Alertas de tiempo en KDS', group: 'Cocina y bar' },
  { key: 'kds.alergenos', label: 'Alérgenos en KDS', group: 'Cocina y bar' },
  { key: 'inventario.stock', label: 'Control de stock', group: 'Inventario' },
  { key: 'inventario.alertas', label: 'Alertas de stock crítico', group: 'Inventario' },
  { key: 'inventario.importar', label: 'Importación por Excel', group: 'Inventario' },
  { key: 'inventario.desperdicios', label: 'Control de desperdicios', group: 'Inventario' },
  { key: 'caja.basica', label: 'Caja y arqueo', group: 'Caja y facturación' },
  { key: 'caja.exportar', label: 'Exportar corte de caja', group: 'Caja y facturación' },
  { key: 'facturas.internas', label: 'Factura interna imprimible', group: 'Caja y facturación' },
  { key: 'facturas.anular', label: 'Anulación de facturas', group: 'Caja y facturación' },
  { key: 'facturas.marca', label: 'Personalización de factura: logo, QR y formato', group: 'Caja y facturación' },
  { key: 'ventas.historial', label: 'Historial de ventas', group: 'Ventas y reportes' },
  { key: 'ventas.exportar', label: 'Exportar ventas', group: 'Ventas y reportes' },
  { key: 'clientes', label: 'Clientes', group: 'Ventas y reportes' },
  { key: 'reportes.basicos', label: 'Reportes del día', group: 'Ventas y reportes' },
  { key: 'reportes.avanzados', label: 'Reportes avanzados', group: 'Ventas y reportes' },
  { key: 'reportes.exportar', label: 'Exportar reportes', group: 'Ventas y reportes' },
  { key: 'areas.croquis', label: 'Croquis y áreas', group: 'Salón' },
  { key: 'areas.reservas', label: 'Reservas y bloqueos de mesas', group: 'Salón' },
  { key: 'usuarios', label: 'Gestión de personal', group: 'Administración' },
  { key: 'configuracion.basica', label: 'Configuración básica del negocio', group: 'Administración' },
  { key: 'configuracion.marca', label: 'Logo, QR y formato de factura', group: 'Administración' },
  { key: 'multi_caja', label: 'Multi-caja', group: 'Gold roadmap' },
  { key: 'multi_sucursal', label: 'Multi-sucursal', group: 'Gold roadmap' },
  { key: 'dte', label: 'DTE / facturación electrónica', group: 'Gold roadmap' },
  { key: 'api', label: 'API e integraciones', group: 'Gold roadmap' },
  { key: 'auditoria', label: 'Auditoría de acciones', group: 'Auditoría y control' },
  { key: 'reportes.bi', label: 'Reportes BI', group: 'Gold roadmap' },
  { key: 'soporte.prioritario', label: 'Soporte prioritario', group: 'Servicios' },
  { key: 'onboarding', label: 'Capacitación / onboarding', group: 'Servicios' }
]);

const FEATURE_LABELS = Object.freeze(
  FEATURE_CATALOG.reduce((acc, item) => {
    acc[item.key] = item.label;
    return acc;
  }, {})
);

const LIMIT_CATALOG = Object.freeze([
  { key: 'usuarios', label: 'Usuarios' },
  { key: 'mesas_fisicas', label: 'Mesas físicas' },
  { key: 'areas', label: 'Áreas / salones' },
  { key: 'productos', label: 'Productos' },
  { key: 'estaciones_kds', label: 'Estaciones KDS' },
  { key: 'cajas', label: 'Cajas' },
  { key: 'sucursales', label: 'Sucursales' }
]);

const LIMIT_LABELS = Object.freeze(
  LIMIT_CATALOG.reduce((acc, item) => {
    acc[item.key] = item.label;
    return acc;
  }, {})
);

const BASIC_FEATURES = Object.freeze([
  'pos.mesas',
  'pos.pedidos',
  'pos.facturar',
  'pos.cancelar',
  'menu.productos',
  'menu.ficha',
  'menu.alergenos',
  'kds.cocina',
  'kds.alergenos',
  'caja.basica',
  'facturas.internas',
  'facturas.anular',
  'ventas.historial',
  'clientes',
  'reportes.basicos',
  'usuarios',
  'configuracion.basica'
]);

const PREMIUM_FEATURES = Object.freeze([
  ...BASIC_FEATURES,
  'pos.mover_pedido',
  'menu.tiempo_preparacion',
  'kds.bar',
  'kds.tiempos',
  'inventario.stock',
  'inventario.alertas',
  'inventario.importar',
  'inventario.desperdicios',
  'caja.exportar',
  'facturas.marca',
  'ventas.exportar',
  'reportes.avanzados',
  'reportes.exportar',
  'areas.croquis',
  'areas.reservas',
  'configuracion.marca'
]);

const GOLD_FEATURES = Object.freeze([
  ...PREMIUM_FEATURES,
  'multi_caja',
  'multi_sucursal',
  'dte',
  'api',
  'auditoria',
  'reportes.bi',
  'soporte.prioritario',
  'onboarding'
]);

const PREMIUM_LIMITS = Object.freeze({
  usuarios: 15,
  mesas_fisicas: 50,
  areas: 5,
  productos: 500,
  estaciones_kds: 2,
  cajas: 1,
  sucursales: 1
});

const GOLD_LIMITS = Object.freeze({
  usuarios: null,
  mesas_fisicas: null,
  areas: null,
  productos: null,
  estaciones_kds: null,
  cajas: null,
  sucursales: null
});

const PLAN_DEFINITIONS = Object.freeze({
  trial: Object.freeze({
    codigo: 'trial',
    nombre: 'Trial',
    descripcion: 'Prueba de 7 días con las funciones de Premium.',
    precio_mensual: 0,
    duracion_dias: 7,
    orden: 0,
    activo: true,
    features: PREMIUM_FEATURES,
    limits: PREMIUM_LIMITS
  }),
  basic: Object.freeze({
    codigo: 'basic',
    nombre: 'Básico',
    descripcion: 'POS esencial para restaurantes pequeños de una sola estación.',
    precio_mensual: 19,
    duracion_dias: 30,
    orden: 1,
    activo: true,
    features: BASIC_FEATURES,
    limits: Object.freeze({
      usuarios: 5,
      mesas_fisicas: 15,
      areas: 1,
      productos: 100,
      estaciones_kds: 1,
      cajas: 1,
      sucursales: 1
    })
  }),
  premium: Object.freeze({
    codigo: 'premium',
    nombre: 'Premium',
    descripcion: 'Operación completa con barra, salón, inventario y reportes.',
    precio_mensual: 39,
    duracion_dias: 30,
    orden: 2,
    activo: true,
    features: PREMIUM_FEATURES,
    limits: PREMIUM_LIMITS
  }),
  gold: Object.freeze({
    codigo: 'gold',
    nombre: 'Gold',
    descripcion: 'Límites ampliados, soporte prioritario y roadmap avanzado, incluido DTE.',
    precio_mensual: 79,
    duracion_dias: 30,
    orden: 3,
    activo: true,
    features: GOLD_FEATURES,
    limits: GOLD_LIMITS
  })
});

function normalizePlanCode(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'pro_plus' || raw === 'pro-plus' || raw === 'proplus') return 'gold';
  if (PLAN_CODES.includes(raw)) return raw;
  return 'trial';
}

function getStaticPlan(code) {
  return PLAN_DEFINITIONS[normalizePlanCode(code)] || PLAN_DEFINITIONS.trial;
}

function getPlanLabel(code) {
  return PLAN_LABELS[normalizePlanCode(code)] || PLAN_LABELS.trial;
}

function getFeatureLabel(featureKey) {
  return FEATURE_LABELS[featureKey] || featureKey;
}

function getLimitLabel(limitKey) {
  return LIMIT_LABELS[limitKey] || limitKey;
}

function minimumPlanForFeature(featureKey) {
  if (BASIC_FEATURES.includes(featureKey)) return 'basic';
  if (PREMIUM_FEATURES.includes(featureKey)) return 'premium';
  if (GOLD_FEATURES.includes(featureKey)) return 'gold';
  return null;
}

function minimumPlanForLimit(limitKey, currentLimit) {
  for (const code of PAID_PLAN_CODES) {
    const value = PLAN_DEFINITIONS[code].limits[limitKey];
    if (value == null || value > Number(currentLimit || 0)) return code;
  }
  return 'gold';
}

module.exports = {
  PLAN_CODES,
  PAID_PLAN_CODES,
  PLAN_LABELS,
  PLAN_DEFINITIONS,
  FEATURE_CATALOG,
  FEATURE_LABELS,
  LIMIT_CATALOG,
  LIMIT_LABELS,
  BASIC_FEATURES,
  PREMIUM_FEATURES,
  GOLD_FEATURES,
  normalizePlanCode,
  getStaticPlan,
  getPlanLabel,
  getFeatureLabel,
  getLimitLabel,
  minimumPlanForFeature,
  minimumPlanForLimit
};
