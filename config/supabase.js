require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE } = process.env;
const supabaseServerKey = SUPABASE_SECRET_KEY || SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !supabaseServerKey) {
    console.error('ERROR: SUPABASE_URL y una clave server-side de Supabase son obligatorias para el backend.');
    process.exit(1);
}

if (supabaseServerKey.startsWith('eyJ')) {
    try {
        const payload = JSON.parse(Buffer.from(supabaseServerKey.split('.')[1] || '', 'base64url').toString());
        if (payload.role !== 'service_role') {
            console.error(`ERROR: la clave server-side de Supabase contiene el rol "${payload.role}".`);
            process.exit(1);
        }
    } catch (error) {
        console.error('ERROR: la clave server-side de Supabase no contiene un JWT valido.');
        process.exit(1);
    }
}

const supabase = createClient(SUPABASE_URL, supabaseServerKey, {
    auth: { persistSession: false, autoRefreshToken: false }
});

const query = async (table, operation = 'select', filters = {}, data = null) => {
    let request = supabase.from(table);
    if (operation === 'select') request = request.select(filters.select || '*');
    else if (operation === 'insert') request = request.insert(data);
    else if (operation === 'update') request = request.update(data);
    else if (operation === 'delete') request = request.delete();
    else throw new Error(`Operacion Supabase no soportada: ${operation}`);

    if (filters.eq) {
        Object.entries(filters.eq).forEach(([key, value]) => { request = request.eq(key, value); });
    }
    if (filters.limit) request = request.limit(filters.limit);
    const { data: result, error } = await request;
    if (error) throw error;
    return result;
};

module.exports = { supabase, query };
