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

module.exports = { dateInTimeZone, getBusinessDate };
