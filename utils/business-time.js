function dateInTimeZone(timeZone, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${value.year}-${value.month}-${value.day}`;
}

function parseDbDate(value) {
  if (!value) return null;
  const text = String(value);
  // Supabase guarda timestamp sin zona en UTC. Agregar Z evita que el
  // servidor o el navegador lo interpreten como hora local.
  return new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`);
}

function formatTimeInTimeZone(timeZone, value, options = {}) {
  const date = value instanceof Date ? value : parseDbDate(value);
  if (!date || Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('es-SV', {
    timeZone: timeZone || 'America/El_Salvador',
    hour: '2-digit',
    minute: '2-digit',
    ...(options.seconds ? { second: '2-digit' } : {})
  }).format(date);
}

async function getBusinessDate(supabase, restauranteId, date = new Date()) {
  const { data, error } = await supabase
    .from('restaurantes')
    .select('timezone')
    .eq('id', restauranteId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Restaurante no encontrado');
  return dateInTimeZone(data.timezone, date);
}

module.exports = { dateInTimeZone, getBusinessDate, parseDbDate, formatTimeInTimeZone };
