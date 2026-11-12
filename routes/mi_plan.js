const express = require('express');
const router = express.Router();
const { loadCatalog, getPlanSync, getUsageSummary } = require('../services/planService');
const { PLAN_CODES, FEATURE_CATALOG } = require('../config/plans');

router.get('/', async (req, res, next) => {
  try {
    await loadCatalog();
    const restauranteId = req.session.usuario.restaurante_id;
    const plan = res.locals.plan || getPlanSync(req.session.usuario.plan);
    const usage = await getUsageSummary(restauranteId, plan.codigo);
    const planes = PLAN_CODES.map((code) => getPlanSync(code));

    const features = FEATURE_CATALOG.map((feature) => ({
      ...feature,
      incluida: plan.features.includes(feature.key)
    }));
    const featureGroups = features.reduce((acc, feature) => {
      if (!acc[feature.group]) acc[feature.group] = [];
      acc[feature.group].push(feature);
      return acc;
    }, {});

    return res.render('mi_plan', {
      usuario: req.session.usuario,
      plan,
      usage,
      planes,
      featureGroups,
      whatsappUrl: `https://wa.me/50373297072?text=${encodeURIComponent(`Hola, quiero mejorar el plan de ${usuarioNombre(req)} en MarrocosPOS.`)}`
    });
  } catch (error) {
    return next(error);
  }
});

function usuarioNombre(req) {
  return req.session?.usuario?.restaurante_nombre
    || req.session?.usuario?.nombre_comercial
    || req.session?.usuario?.nombre
    || 'mi restaurante';
}

module.exports = router;
