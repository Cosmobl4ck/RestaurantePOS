const { supabase } = require('../config/supabase');
const {
  PLAN_CODES,
  PLAN_DEFINITIONS,
  LIMIT_CATALOG,
  normalizePlanCode,
  getStaticPlan
} = require('../config/plans');

const CACHE_TTL_MS = Number(process.env.PLAN_CACHE_TTL_MS) || 60 * 1000;
const SPECIAL_TABLE_RE = /domicilio|llevar/i;

let cache = { at: 0, plans: null };
let schemaWarningShown = false;

function clonePlan(plan) {
  return {
    ...plan,
    features: [...plan.features],
    limits: { ...plan.limits }
  };
}

function buildStaticCatalog() {
  return PLAN_CODES.reduce((acc, code) => {
    acc[code] = clonePlan(PLAN_DEFINITIONS[code]);
    return acc;
  }, {});
}

function looksLikeMissingSchema(error) {
  return ['42P01', '42703', 'PGRST200', 'PGRST204', 'PGRST205'].includes(error?.code)
    || /relation|column|schema cache/i.test(error?.message || '');
}

function mergeCatalog(planes, features, limits) {
  const catalog = buildStaticCatalog();
  if (!Array.isArray(planes) || planes.length === 0) return catalog;

  const featuresByPlan = new Map();
  (features || []).forEach((row) => {
    const code = normalizePlanCode(row.plan_codigo);
    if (!featuresByPlan.has(code)) featuresByPlan.set(code, []);
    if (row.habilitado !== false) featuresByPlan.get(code).push(String(row.feature_key));
  });

  const limitsByPlan = new Map();
  (limits || []).forEach((row) => {
    const code = normalizePlanCode(row.plan_codigo);
    if (!limitsByPlan.has(code)) limitsByPlan.set(code, {});
    limitsByPlan.get(code)[String(row.limit_key)] = row.limit_value == null
      ? null
      : Number(row.limit_value);
  });

  planes.forEach((row) => {
    const code = normalizePlanCode(row.codigo);
    if (!catalog[code]) return;

    catalog[code] = {
      ...catalog[code],
      nombre: String(row.nombre || catalog[code].nombre),
      descripcion: row.descripcion == null ? catalog[code].descripcion : String(row.descripcion),
      precio_mensual: row.precio_mensual == null
        ? catalog[code].precio_mensual
        : Number(row.precio_mensual),
      duracion_dias: row.duracion_dias == null
        ? catalog[code].duracion_dias
        : Number(row.duracion_dias),
      orden: row.orden == null ? catalog[code].orden : Number(row.orden),
      activo: row.activo !== false
    };

    if (featuresByPlan.has(code)) {
      catalog[code].features = [...new Set(featuresByPlan.get(code))];
    }

    if (limitsByPlan.has(code)) {
      catalog[code].limits = {
        ...catalog[code].limits,
        ...limitsByPlan.get(code)
      };
    }
  });

  return catalog;
}

async function loadCatalog(force = false) {
  if (!force && cache.plans && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.plans;
  }

  try {
    const [planesResult, featuresResult, limitsResult] = await Promise.all([
      supabase.from('planes').select('codigo, nombre, descripcion, precio_mensual, duracion_dias, activo, orden'),
      supabase.from('plan_features').select('plan_codigo, feature_key, habilitado'),
      supabase.from('plan_limits').select('plan_codigo, limit_key, limit_value')
    ]);

    const firstError = planesResult.error || featuresResult.error || limitsResult.error;
    if (firstError) {
      if (!looksLikeMissingSchema(firstError) && !schemaWarningShown) {
        console.error('No se pudo cargar el catálogo de planes:', firstError.message);
        schemaWarningShown = true;
      }
      cache = { at: Date.now(), plans: buildStaticCatalog() };
      return cache.plans;
    }

    const planes = planesResult.data || [];
    cache = {
      at: Date.now(),
      plans: mergeCatalog(planes, featuresResult.data || [], limitsResult.data || [])
    };
    return cache.plans;
  } catch (error) {
    if (!schemaWarningShown) {
      console.warn('Catálogo de planes en modo local:', error.message);
      schemaWarningShown = true;
    }
    cache = { at: Date.now(), plans: buildStaticCatalog() };
    return cache.plans;
  }
}

function getPlanSync(code) {
  const normalized = normalizePlanCode(code);
  const catalog = cache.plans || buildStaticCatalog();
  return catalog[normalized] || getStaticPlan(normalized);
}

function hasFeatureSync(planCode, featureKey) {
  return getPlanSync(planCode).features.includes(String(featureKey));
}

function getLimitSync(planCode, limitKey) {
  const value = getPlanSync(planCode).limits[String(limitKey)];
  return value == null ? null : Number(value);
}

function clearCatalogCache() {
  cache = { at: 0, plans: null };
}

async function countExact(table, restauranteId) {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('restaurante_id', restauranteId);
  if (error) throw error;
  return Number(count || 0);
}

async function getPhysicalTableCount(restauranteId) {
  const { data, error } = await supabase
    .from('mesas')
    .select('numero')
    .eq('restaurante_id', restauranteId);
  if (error) throw error;
  return (data || []).filter((mesa) => !SPECIAL_TABLE_RE.test(String(mesa.numero || ''))).length;
}

async function getUsage(restauranteId, limitKey) {
  switch (limitKey) {
    case 'usuarios':
      return countExact('usuarios', restauranteId);
    case 'productos':
      return countExact('productos', restauranteId);
    case 'areas':
      return countExact('areas_restaurante', restauranteId);
    case 'mesas_fisicas':
      return getPhysicalTableCount(restauranteId);
    case 'sucursales':
      return 1;
    default:
      return 0;
  }
}

async function getUsageSummary(restauranteId, planCode) {
  const plan = getPlanSync(planCode);
  const keys = ['usuarios', 'mesas_fisicas', 'areas', 'productos'];
  const items = await Promise.all(keys.map(async (key) => {
    const usage = await getUsage(restauranteId, key);
    const limit = plan.limits[key] == null ? null : Number(plan.limits[key]);
    const percent = limit == null || limit === 0
      ? null
      : Math.min(100, Math.round((usage / limit) * 100));
    const meta = LIMIT_CATALOG.find((item) => item.key === key);
    return {
      key,
      label: meta?.label || key,
      usage,
      limit,
      percent,
      nearLimit: limit != null && usage >= Math.max(1, limit - 1)
    };
  }));
  return items;
}

async function getDowngradeViolations(restauranteId, targetPlanCode) {
  const target = getPlanSync(targetPlanCode);
  const violations = [];
  for (const item of LIMIT_CATALOG) {
    const limit = target.limits[item.key];
    if (limit == null) continue;
    const usage = await getUsage(restauranteId, item.key);
    if (usage > Number(limit)) {
      violations.push({
        key: item.key,
        label: item.label,
        usage,
        limit: Number(limit)
      });
    }
  }
  return violations;
}

module.exports = {
  loadCatalog,
  clearCatalogCache,
  getPlanSync,
  hasFeatureSync,
  getLimitSync,
  getUsage,
  getUsageSummary,
  getDowngradeViolations
};
