/**
 * Crea (o elimina) un negocio DEMO para probar la app en local.
 *
 *   node scripts/seed-demo.js          -> crea el demo si la base está vacía
 *   node scripts/seed-demo.js --force  -> crea el demo aunque haya otros negocios
 *   node scripts/seed-demo.js --clean  -> elimina el negocio DEMO01
 *
 * Credenciales del demo:
 *   Código de negocio: DEMO01
 *   Usuario:           Admin
 *   PIN:               123456
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const DEMO_CODE = 'DEMO01';
const DEMO_NAME = 'Restaurante Demo';
const DEMO_PIN = '123456';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE,
    { auth: { persistSession: false, autoRefreshToken: false } }
);

async function eliminarDemo() {
    const { data, error } = await supabase
        .from('restaurantes')
        .select('id')
        .eq('codigo_negocio', DEMO_CODE)
        .maybeSingle();

    if (error) throw error;
    if (!data) {
        console.log(`No existe el negocio ${DEMO_CODE}.`);
        return;
    }

    const { error: deleteError } = await supabase
        .from('restaurantes')
        .delete()
        .eq('id', data.id);

    if (deleteError) throw deleteError;
    console.log(`Negocio ${DEMO_CODE} eliminado (id ${data.id}).`);
}

async function crearDemo(force) {
    const { count, error: countError } = await supabase
        .from('restaurantes')
        .select('*', { count: 'exact', head: true });

    if (countError) throw countError;

    if ((count || 0) > 0 && !force) {
        console.error(`La base ya tiene ${count} restaurante(s).`);
        console.error('No se crea el demo para no mezclar datos. Usa --force si lo quieres igual.');
        process.exit(1);
    }

    const ahora = new Date();
    const vencimiento = new Date(ahora.getTime() + 30 * 24 * 60 * 60 * 1000);

    const { data: restaurante, error: restauranteError } = await supabase
        .from('restaurantes')
        .insert({
            codigo_negocio: DEMO_CODE,
            nombre_comercial: DEMO_NAME,
            estado: 'activo',
            plan: 'trial',
            fecha_inicio: ahora.toISOString(),
            fecha_vencimiento: vencimiento.toISOString(),
            timezone: 'America/El_Salvador'
        })
        .select('id, codigo_negocio')
        .single();

    if (restauranteError) throw restauranteError;

    try {
        const pinHash = bcrypt.hashSync(DEMO_PIN, 10);

        const { error: usuarioError } = await supabase
            .from('usuarios')
            .insert({
                restaurante_id: restaurante.id,
                nombre: 'Admin',
                rol: 'admin',
                pin_hash: pinHash,
                estado: 1
            });
        if (usuarioError) throw usuarioError;

        const { error: productosError } = await supabase
            .from('productos')
            .insert([
                { restaurante_id: restaurante.id, codigo: 'P001', nombre: 'Hamburguesa Clasica', precio_unidad: 8.5, categoria: 'Cocina', maneja_stock: false, stock: 0 },
                { restaurante_id: restaurante.id, codigo: 'P002', nombre: 'Pizza Pepperoni', precio_unidad: 12, categoria: 'Cocina', maneja_stock: false, stock: 0 },
                { restaurante_id: restaurante.id, codigo: 'P003', nombre: 'Papas Fritas Grandes', precio_unidad: 3.5, categoria: 'Cocina', maneja_stock: false, stock: 0 },
                { restaurante_id: restaurante.id, codigo: 'B001', nombre: 'Refresco Natural 16oz', precio_unidad: 1.5, categoria: 'Bar', maneja_stock: true, stock: 80, stock_minimo: 10 },
                { restaurante_id: restaurante.id, codigo: 'B002', nombre: 'Cerveza Nacional', precio_unidad: 2.5, categoria: 'Bar', maneja_stock: true, stock: 120, stock_minimo: 12 }
            ]);
        if (productosError) throw productosError;

        const mesas = [];
        for (let i = 1; i <= 10; i += 1) {
            mesas.push({
                restaurante_id: restaurante.id,
                numero: `Mesa ${i}`,
                descripcion: i <= 5 ? 'Salon principal' : 'Terraza',
                estado: 'libre',
                id_externo: `demo-mesa-${i}`
            });
        }
        mesas.push(
            { restaurante_id: restaurante.id, numero: 'PARA LLEVAR', descripcion: 'Pedidos en caja', estado: 'libre', id_externo: 'demo-para-llevar' },
            { restaurante_id: restaurante.id, numero: 'A DOMICILIO', descripcion: 'Pedidos delivery', estado: 'libre', id_externo: 'demo-domicilio' }
        );

        const { error: mesasError } = await supabase.from('mesas').insert(mesas);
        if (mesasError) throw mesasError;

        const { error: configError } = await supabase
            .from('configuracion_impresion')
            .insert({
                restaurante_id: restaurante.id,
                nombre_negocio: 'Marrocos POS Demo',
                direccion: 'San Salvador, El Salvador',
                telefono: '2222-2222',
                nit: '0614-000000-000-0',
                pie_pagina: 'Gracias por su compra'
            });
        if (configError) throw configError;

        console.log('========================================');
        console.log('NEGOCIO DEMO CREADO');
        console.log('  Codigo de negocio:', DEMO_CODE);
        console.log('  Usuario:          Admin');
        console.log('  PIN:              ', DEMO_PIN);
        console.log('  Restaurante id:   ', restaurante.id);
        console.log('  Vence:            ', vencimiento.toLocaleDateString('es-SV'));
        console.log('========================================');
        console.log('Para eliminarlo: node scripts/seed-demo.js --clean');
    } catch (error) {
        // Rollback: no dejar un tenant a medio crear.
        await supabase.from('restaurantes').delete().eq('id', restaurante.id);
        throw error;
    }
}

(async () => {
    try {
        if (process.argv.includes('--clean')) {
            await eliminarDemo();
        } else {
            await crearDemo(process.argv.includes('--force'));
        }
    } catch (error) {
        console.error('ERROR:', error.message);
        process.exit(1);
    }
})();
