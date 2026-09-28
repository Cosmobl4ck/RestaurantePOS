/**
 * Supabase Configuration
 * Reemplaza database.js con este archivo
 * 
 * InstalaciÃ³n:
 * pnpm install @supabase/supabase-js
 * 
 * Crear .env en la raÃ­z de SistemaBase/:
 * SUPABASE_URL=https://your-project.supabase.co
 * SUPABASE_KEY=your-anon-public-key
 * SUPABASE_SERVICE_ROLE=your-service-role-key (solo para servidor)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error('âŒ ERROR: Falta SUPABASE_URL o SUPABASE_KEY en .env');
    console.error('   Crea un archivo .env con:');
    console.error('   SUPABASE_URL=https://your-project.supabase.co');
    console.error('   SUPABASE_KEY=your-anon-public-key');
    process.exit(1);
}

const supabaseKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY;

if (!process.env.SUPABASE_SERVICE_ROLE) {
    console.warn('âš ï¸ SUPABASE_SERVICE_ROLE no esta configurada. Las tablas con RLS pueden bloquear escrituras desde el servidor.');
} else if (process.env.SUPABASE_SERVICE_ROLE.startsWith('eyJ')) {
    try {
        const payload = JSON.parse(Buffer.from(process.env.SUPABASE_SERVICE_ROLE.split('.')[1] || '', 'base64url').toString());
        if (payload.role !== 'service_role') {
            console.warn(`âš ï¸ SUPABASE_SERVICE_ROLE tiene rol "${payload.role}". Debe ser "service_role" para escribir en tablas con RLS.`);
        }
    } catch (error) {
        console.warn('âš ï¸ No se pudo validar el rol de SUPABASE_SERVICE_ROLE.');
    }
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    supabaseKey,
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    }
);

// Test de conexiÃ³n
supabase.from('restaurantes').select('count', { count: 'exact', head: true })
    .then(({ data, error }) => {
        if (error) {
            console.error('âŒ Error de conexiÃ³n Supabase:', error.message);
        } else {
            console.log('âœ… Supabase conectado correctamente');
        }
    })
    .catch(err => console.error('âŒ Error:', err.message));

/**
 * HELPER FUNCTIONS para migraciones desde MySQL
 */

// Ejecutar query con manejo de errores
const query = async (table, operation = 'select', filters = {}, data = null) => {
    try {
        let q = supabase.from(table);

        switch (operation) {
            case 'select':
                q = q.select(filters.select || '*');
                if (filters.eq) {
                    Object.entries(filters.eq).forEach(([key, val]) => {
                        q = q.eq(key, val);
                    });
                }
                if (filters.limit) q = q.limit(filters.limit);
                break;

            case 'insert':
                q = q.insert(data);
                break;

            case 'update':
                q = q.update(data);
                if (filters.eq) {
                    Object.entries(filters.eq).forEach(([key, val]) => {
                        q = q.eq(key, val);
                    });
                }
                break;

            case 'delete':
                q = q.delete();
                if (filters.eq) {
                    Object.entries(filters.eq).forEach(([key, val]) => {
                        q = q.eq(key, val);
                    });
                }
                break;
        }

        const { data: result, error } = await q;

        if (error) {
            console.error(`âŒ Error en ${table}.${operation}:`, error.message);
            throw error;
        }

        return result;
    } catch (error) {
        console.error(`âŒ Error en query:`, error.message);
        throw error;
    }
};

/**
 * VALIDACIONES MULTI-TENANT
 */

// Validar que un restaurante estÃ¡ activo y no vencido
const validarRestaurante = async (restaurante_id) => {
    const restaurantes = await query('restaurantes', 'select', {
        eq: { id: restaurante_id }
    });

    if (restaurantes.length === 0) {
        throw new Error('Restaurante no encontrado');
    }

    const r = restaurantes[0];

    if (r.estado !== 'activo') {
        throw new Error(`Restaurante ${r.estado.toUpperCase()}`);
    }

    if (new Date(r.fecha_vencimiento) < new Date()) {
        throw new Error('Licencia vencida. Contacte a administraciÃ³n.');
    }

    return r;
};

// Validar que el usuario pertenece al restaurante
const validarUsuario = async (usuario_id, restaurante_id) => {
    const usuarios = await query('usuarios', 'select', {
        eq: { id: usuario_id, restaurante_id: restaurante_id }
    });

    if (usuarios.length === 0) {
        throw new Error('Usuario no autorizado para este restaurante');
    }

    return usuarios[0];
};

/**
 * QUERIES COMUNES CON MULTI-TENANT
 */

// Login: Buscar usuario por cÃ³digo de negocio + nombre
const loginUsuario = async (codigo_negocio, nombre) => {
    const { data, error } = await supabase
        .from('usuarios')
        .select('*, restaurantes(codigo_negocio, estado, fecha_vencimiento)')
        .eq('nombre', nombre)
        .eq('restaurantes.codigo_negocio', codigo_negocio)
        .eq('estado', 1)
        .single();

    if (error) {
        console.log('No se encontrÃ³ usuario:', error.message);
        return null;
    }

    return data;
};

// Obtener todos los productos de un restaurante
const getProductos = async (restaurante_id) => {
    return await query('productos', 'select', {
        eq: { restaurante_id: restaurante_id }
    });
};

// Obtener todas las mesas de un restaurante
const getMesas = async (restaurante_id) => {
    return await query('mesas', 'select', {
        eq: { restaurante_id: restaurante_id }
    });
};

// Obtener pedidos abiertos de un restaurante
const getPedidosAbiertos = async (restaurante_id) => {
    const { data, error } = await supabase
        .from('pedidos')
        .select('*, mesas(numero), pedido_items(*)')
        .eq('restaurante_id', restaurante_id)
        .eq('estado', 'abierto');

    if (error) throw error;
    return data;
};

// Obtener facturas del dÃ­a
const getFacturasHoy = async (restaurante_id) => {
    const hoy = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('facturas')
        .select('*')
        .eq('restaurante_id', restaurante_id)
        .gte('fecha', `${hoy}T00:00:00`)
        .lte('fecha', `${hoy}T23:59:59`);

    if (error) throw error;
    return data;
};

// Obtener total de ventas del dÃ­a
const getTotalVentasHoy = async (restaurante_id) => {
    const facturas = await getFacturasHoy(restaurante_id);
    return facturas.reduce((sum, f) => sum + (f.total || 0), 0);
};

// Obtener estado de la caja
const getCortesCaja = async (restaurante_id) => {
    const hoy = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('cortes_caja')
        .select('*')
        .eq('restaurante_id', restaurante_id)
        .eq('fecha', hoy);

    if (error) throw error;
    return data;
};

// Monitoreo de licencias
const getRestaurantesVencidos = async () => {
    const { data, error } = await supabase
        .from('restaurantes')
        .select('id, nombre_comercial, codigo_negocio, fecha_vencimiento, estado')
        .lt('fecha_vencimiento', new Date().toISOString())
        .eq('estado', 'activo');

    if (error) throw error;
    return data;
};

// Restaurantes prÃ³ximos a vencer (5 dÃ­as)
const getRestaurantesProximoAVencer = async () => {
    const hoy = new Date();
    const en5Dias = new Date(hoy.getTime() + 5 * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
        .from('restaurantes')
        .select('id, nombre_comercial, codigo_negocio, fecha_vencimiento, estado')
        .gte('fecha_vencimiento', hoy.toISOString())
        .lte('fecha_vencimiento', en5Dias.toISOString())
        .eq('estado', 'activo');

    if (error) throw error;
    return data;
};

module.exports = {
    supabase,
    query,
    
    // Validaciones
    validarRestaurante,
    validarUsuario,
    
    // Queries comunes
    loginUsuario,
    getProductos,
    getMesas,
    getPedidosAbiertos,
    getFacturasHoy,
    getTotalVentasHoy,
    getCortesCaja,
    getRestaurantesVencidos,
    getRestaurantesProximoAVencer
};

