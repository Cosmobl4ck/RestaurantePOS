const {
  getPlanSync,
  hasFeatureSync,
  getLimitSync,
  getUsage
} = require('../services/planService');
const {
  getPlanLabel,
  getFeatureLabel,
  getLimitLabel,
  minimumPlanForFeature,
  minimumPlanForLimit
} = require('../config/plans');

function enforcementEnabled() {
  const raw = process.env.PLAN_ENFORCEMENT;
  return !(raw != null && (String(raw).toLowerCase() === 'false' || String(raw) === '0'));
}

function currentPlan(req, res) {
  if (res?.locals?.plan) return res.locals.plan;
  return getPlanSync(req.session?.usuario?.plan || 'trial');
}

function wantsJson(req) {
  return req.accepts(['html', 'json']) === 'json' || req.xhr || req.path.startsWith('/api/');
}

function denyFeature(req, res, featureKey) {
  const plan = currentPlan(req, res);
  const requiredCode = minimumPlanForFeature(featureKey);
  const requiredPlan = requiredCode ? getPlanSync(requiredCode) : null;
  const featureLabel = getFeatureLabel(featureKey);
  const message = requiredPlan
    ? `La función "${featureLabel}" está disponible en el plan ${requiredPlan.nombre}.`
    : `La función "${featureLabel}" no está disponible en tu plan actual.`;

  const payload = {
    error: message,
    code: 'PLAN_REQUIRED',
    feature: featureKey,
    feature_label: featureLabel,
    current_plan: plan.codigo,
    required_plan: requiredPlan?.codigo || null,
    upgrade_url: '/mi-plan'
  };

  if (wantsJson(req)) return res.status(403).json(payload);

  return res.status(403).render('plan-required', {
    error: { message, status: 403 },
    usuario: req.session?.usuario || null,
    plan,
    currentPlan: plan,
    requiredPlan,
    featureKey,
    featureLabel,
    limitKey: null,
    limitLabel: null,
    usage: null,
    limit: null
  });
}

function denyLimit(req, res, { limitKey, usage, limit, plan }) {
  const current = plan || currentPlan(req, res);
  const requiredCode = minimumPlanForLimit(limitKey, limit);
  const requiredPlan = requiredCode ? getPlanSync(requiredCode) : null;
  const limitLabel = getLimitLabel(limitKey);
  const message = `Has alcanzado el límite de ${limit} ${limitLabel.toLowerCase()} del plan ${getPlanLabel(current.codigo)}.`;

  const payload = {
    error: message,
    code: 'PLAN_LIMIT',
    limit_key: limitKey,
    limit_label: limitLabel,
    usage,
    limit,
    current_plan: current.codigo,
    required_plan: requiredPlan?.codigo || null,
    upgrade_url: '/mi-plan'
  };

  if (wantsJson(req)) return res.status(403).json(payload);

  return res.status(403).render('plan-required', {
    error: { message, status: 403 },
    usuario: req.session?.usuario || null,
    plan: current,
    currentPlan: current,
    requiredPlan,
    featureKey: null,
    featureLabel: null,
    limitKey,
    limitLabel,
    usage,
    limit
  });
}

function requireFeature(featureKey) {
  return (req, res, next) => {
    if (!enforcementEnabled()) return next();
    const plan = currentPlan(req, res);
    if (hasFeatureSync(plan.codigo, featureKey)) return next();
    return denyFeature(req, res, featureKey);
  };
}

function enforceLimit(limitKey) {
  return async (req, res, next) => {
    if (!enforcementEnabled()) return next();

    try {
      const plan = currentPlan(req, res);
      const limit = getLimitSync(plan.codigo, limitKey);
      if (limit == null) return next();

      const usage = await getUsage(req.session.usuario.restaurante_id, limitKey);
      if (usage < limit) return next();

      return denyLimit(req, res, { limitKey, usage, limit, plan });
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  enforcementEnabled,
  currentPlan,
  denyFeature,
  denyLimit,
  requireFeature,
  enforceLimit
};
