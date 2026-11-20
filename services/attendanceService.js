const { supabase } = require('../config/supabase');
const { normalizeIp } = require('../utils/ip-access');

/**
 * Registra asistencia de forma best-effort: no debe romper el login/logout.
 * tipo: 'entrada' | 'salida'
 */
async function registrarAsistencia({ restauranteId, empleadoId, tipo, metodo, ip }) {
  if (!restauranteId || !empleadoId || !tipo) return null;

  const { data, error } = await supabase.rpc('registrar_asistencia', {
    p_restaurante_id: Number(restauranteId),
    p_empleado_id: Number(empleadoId),
    p_tipo: tipo,
    p_metodo: metodo || null,
    p_ip: normalizeIp(ip).slice(0, 80) || null
  });

  if (error) throw error;
  return data;
}

module.exports = { registrarAsistencia };
