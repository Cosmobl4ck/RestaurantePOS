require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    console.error('ERROR: SUPABASE_URL y SUPABASE_SERVICE_ROLE son obligatorias para el backend.');
    process.exit(1);
}

if (SUPABASE_SERVICE_ROLE.startsWith('eyJ')) {
    try {
        const payload = JSON.parse(Buffer.from(SUPABASE_SERVICE_ROLE.split('.')[1] || '', 'base64url').toString());
        if (payload.role !== 'service_role') {
            console.error(`ERROR: SUPABASE_SERVICE_ROLE contiene el rol "${payload.role}".`);
            process.exit(1);
        }
    } catch (error) {
        console.error('ERROR: SUPABASE_SERVICE_ROLE no contiene un JWT valido.');
        process.exit(1);
    }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
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
