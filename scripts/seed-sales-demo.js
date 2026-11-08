/**
 * Genera datos de prueba para el negocio DEMO01:
 *   - 10 clientes
 *   - 10 platos, 10 bebidas y 10 aperitivos
 *   - 20 ventas por dia durante los 6 dias anteriores
 *   - hoy queda en cero
 *
 * Uso:
 *   node scripts/seed-sales-demo.js            crea los datos si no existen
 *   node scripts/seed-sales-demo.js --reset    borra lo generado y lo vuelve a crear
 *   node scripts/seed-sales-demo.js --clean    solo borra lo generado
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { dateInTimeZone } = require('../utils/business-time');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE,
    { auth: { persistSession: false, autoRefreshToken: false } }
);

const DEMO_CODE = 'DEMO01';
const TIMEZONE = 'America/El_Salvador';
const SALE_MARKER = '[demo] ';
const SALES_PER_DAY = 20;
const DAYS = 6;
const PRODUCT_PREFIX = 'DEMO-';

const CLIENTS = [
    { nombre: 'María López', telefono: '7890-1234', direccion: 'Col. Escalón, San Salvador' },
    { nombre: 'Carlos Hernández', telefono: '7123-4567', direccion: 'Santa Tecla, La Libertad' },
    { nombre: 'Ana Martínez', telefono: '7456-7890', direccion: 'Soyapango, San Salvador' },
    { nombre: 'José Ramírez', telefono: '7789-0123', direccion: 'Mejicanos, San Salvador' },
    { nombre: 'Laura Gómez', telefono: '7012-3456', direccion: 'Antiguo Cuscatlán, La Libertad' },
    { nombre: 'Diego Torres', telefono: '7345-6789', direccion: 'San Miguel' },
    { nombre: 'Sofía Castro', telefono: '7678-9012', direccion: 'Santa Ana' },
    { nombre: 'Miguel Flores', telefono: '7901-2345', direccion: 'Apopa, San Salvador' },
    { nombre: 'Valeria Rivas', telefono: '7234-5678', direccion: 'Ilopango, San Salvador' },
    { nombre: 'Jorge Mejía', telefono: '7567-8901', direccion: 'Usulután' }
];

const PRODUCTS = [
    // 10 platos
    { codigo: 'DEMO-D01', nombre: 'Carne Asada', grupo: 'plato', categoria: 'Cocina', precio_unidad: 12.50, maneja_stock: false, stock: 0, stock_minimo: 0 },
    { codigo: 'DEMO-D02', nombre: 'Pollo Guisado', grupo: 'plato', categoria: 'Cocina', precio_unidad: 9.75, maneja_stock: false, stock: 0, stock_minimo: 0 },
    { codigo: 'DEMO-D03', nombre: 'Pupusas de Queso (3 uds)', grupo: 'plato', categoria: 'Cocina', precio_unidad: 4.50, maneja_stock: false, stock: 0, stock_minimo: 0 },
    { codigo: 'DEMO-D04', nombre: 'Enchiladas Salvadoreñas', grupo: 'plato', categoria: 'Cocina', precio_unidad: 6.00, maneja_stock: false, stock: 0, stock_minimo: 0 },
    { codigo: 'DEMO-D05', nombre: 'Tacos de Res (3 uds)', grupo: 'plato', categoria: 'Cocina', precio_unidad: 8.00, maneja_stock: false, stock: 0, stock_minimo: 0 },
    { codigo: 'DEMO-D06', nombre: 'Pasta Alfredo', grupo: 'plato', categoria: 'Cocina', precio_unidad: 10.50, maneja_stock: false, stock: 0, stock_minimo: 0 },
    { codigo: 'DEMO-D07', nombre: 'Salmón a la Plancha', grupo: 'plato', categoria: 'Cocina', precio_unidad: 14.00, maneja_stock: false, stock: 0, stock_minimo: 0 },
    { codigo: 'DEMO-D08', nombre: 'Costillas BBQ', grupo: 'plato', categoria: 'Cocina', precio_unidad: 13.50, maneja_stock: false, stock: 0, stock_minimo: 0 },
    { codigo: 'DEMO-D09', nombre: 'Sopa de Gallina', grupo: 'plato', categoria: 'Cocina', precio_unidad: 7.00, maneja_stock: false, stock: 0, stock_minimo: 0 },
    { codigo: 'DEMO-D10', nombre: 'Arroz con Camarones', grupo: 'plato', categoria: 'Cocina', precio_unidad: 13.00, maneja_stock: false, stock: 0, stock_minimo: 0 },

    // 10 bebidas
    { codigo: 'DEMO-B01', nombre: 'Horchata', grupo: 'bebida', categoria: 'Bar', precio_unidad: 2.00, maneja_stock: true, stock: 240, stock_minimo: 20 },
    { codigo: 'DEMO-B02', nombre: 'Jamaica', grupo: 'bebida', categoria: 'Bar', precio_unidad: 1.75, maneja_stock: true, stock: 220, stock_minimo: 20 },
    { codigo: 'DEMO-B03', nombre: 'Tamarindo', grupo: 'bebida', categoria: 'Bar', precio_unidad: 1.75, maneja_stock: true, stock: 210, stock_minimo: 20 },
    { codigo: 'DEMO-B04', nombre: 'Café Americano', grupo: 'bebida', categoria: 'Bar', precio_unidad: 2.25, maneja_stock: true, stock: 180, stock_minimo: 18 },
    { codigo: 'DEMO-B05', nombre: 'Limonada', grupo: 'bebida', categoria: 'Bar', precio_unidad: 2.00, maneja_stock: true, stock: 200, stock_minimo: 20 },
    { codigo: 'DEMO-B06', nombre: 'Cerveza Pilsener', grupo: 'bebida', categoria: 'Bar', precio_unidad: 2.50, maneja_stock: true, stock: 300, stock_minimo: 24 },
    { codigo: 'DEMO-B07', nombre: 'Cerveza Regia', grupo: 'bebida', categoria: 'Bar', precio_unidad: 2.50, maneja_stock: true, stock: 280, stock_minimo: 24 },
    { codigo: 'DEMO-B08', nombre: 'Coca-Cola', grupo: 'bebida', categoria: 'Bar', precio_unidad: 1.50, maneja_stock: true, stock: 260, stock_minimo: 24 },
    { codigo: 'DEMO-B09', nombre: 'Agua Mineral', grupo: 'bebida', categoria: 'Bar', precio_unidad: 1.25, maneja_stock: true, stock: 300, stock_minimo: 24 },
    { codigo: 'DEMO-B10', nombre: 'Jugo de Naranja', grupo: 'bebida', categoria: 'Bar', precio_unidad: 2.50, maneja_stock: true, stock: 160, stock_minimo: 16 },

    // 10 aperitivos
    { codigo: 'DEMO-A01', nombre: 'Nachos con Queso', grupo: 'aperitivo', categoria: 'Cocina', precio_unidad: 6.50, maneja_stock: false, stock: 0, stock_minimo: 0 },
    { codigo: 'DEMO-A02', nombre: 'Alitas BBQ (6 uds)', grupo: 'aperitivo', categoria: 'Cocina', precio_unidad: 7.50, maneja_stock: false, stock: 0, stock_minimo: 0 },
    { codigo: 'DEMO-A03', nombre: 'Papas Fritas', grupo: 'aperitivo', categoria: 'Cocina', precio_unidad: 3.50, maneja_stock: false, stock: 0, stock_minimo: 0 },
    { codigo: 'DEMO-A04', nombre: 'Aros de Cebolla', grupo: 'aperitivo', categoria: 'Cocina', precio_unidad: 4.00, maneja_stock: false, stock: 0, stock_minimo: 0 },
    { codigo: 'DEMO-A05', nombre: 'Guacamole con Totopos', grupo: 'aperitivo', categoria: 'Cocina', precio_unidad: 5.50, maneja_stock: false, stock: 0, stock_minimo: 0 },
    { codigo: 'DEMO-A06', nombre: 'Quesadillas de Queso', grupo: 'aperitivo', categoria: 'Cocina', precio_unidad: 5.00, maneja_stock: false, stock: 0, stock_minimo: 0 },
    { codigo: 'DEMO-A07', nombre: 'Empanadas de Plátano (3 uds)', grupo: 'aperitivo', categoria: 'Cocina', precio_unidad: 4.50, maneja_stock: false, stock: 0, stock_minimo: 0 },
    { codigo: 'DEMO-A08', nombre: 'Yuca Frita', grupo: 'aperitivo', categoria: 'Cocina', precio_unidad: 4.00, maneja_stock: false, stock: 0, stock_minimo: 0 },
    { codigo: 'DEMO-A09', nombre: 'Chicharrón', grupo: 'aperitivo', categoria: 'Cocina', precio_unidad: 6.00, maneja_stock: false, stock: 0, stock_minimo: 0 },
    { codigo: 'DEMO-A10', nombre: 'Camarones al Ajillo', grupo: 'aperitivo', categoria: 'Cocina', precio_unidad: 8.50, maneja_stock: false, stock: 0, stock_minimo: 0 }
];

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(array) {
    return array[randInt(0, array.length - 1)];
}

function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function localDateTime(day, minutes) {
    const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mins = String(minutes % 60).padStart(2, '0');
    return `${day}T${hours}:${mins}:00`;
}

function addDays(day, offset) {
    const date = new Date(`${day}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
}

function chunks(array, size) {
    const result = [];
    for (let i = 0; i < array.length; i += size) result.push(array.slice(i, i + size));
    return result;
}

async function getDemo() {
    const { data, error } = await supabase
        .from('restaurantes')
        .select('id, codigo_negocio, nombre_comercial, timezone')
        .eq('codigo_negocio', DEMO_CODE)
        .maybeSingle();
    if (error) throw error;
    return data;
}

async function insertChunks(table, rows, size, select) {
    const result = [];
    for (const chunk of chunks(rows, size)) {
        const { data, error } = await supabase.from(table).insert(chunk).select(select);
        if (error) throw new Error(`${table}: ${error.message}`);
        result.push(...(data || []));
    }
    return result;
}

async function cleanup(restauranteId) {
    const { data: pedidos, error: pedidosError } = await supabase
        .from('pedidos')
        .select('id')
        .eq('restaurante_id', restauranteId)
        .like('notas', `${SALE_MARKER}%`);
    if (pedidosError) throw pedidosError;

    const pedidoIds = (pedidos || []).map((p) => p.id);

    for (const chunk of chunks(pedidoIds, 50)) {
        const { error } = await supabase
            .from('facturas')
            .delete()
            .eq('restaurante_id', restauranteId)
            .in('pedido_id', chunk);
        if (error) throw error;
    }

    for (const chunk of chunks(pedidoIds, 50)) {
        const { error } = await supabase
            .from('pedidos')
            .delete()
            .eq('restaurante_id', restauranteId)
            .in('id', chunk);
        if (error) throw error;
    }

    const { error: clientesError } = await supabase
        .from('clientes')
        .delete()
        .eq('restaurante_id', restauranteId)
        .in('nombre', CLIENTS.map((c) => c.nombre));
    if (clientesError) throw clientesError;

    const { error: productosError } = await supabase
        .from('productos')
        .delete()
        .eq('restaurante_id', restauranteId)
        .like('codigo', `${PRODUCT_PREFIX}%`);
    if (productosError) throw productosError;

    console.log(`Limpieza completada: ${pedidoIds.length} pedidos demo eliminados.`);
}

async function seed(demo) {
    const restauranteId = demo.id;

    const { data: clientRows, error: clientError } = await supabase
        .from('clientes')
        .insert(CLIENTS.map((c) => ({ ...c, restaurante_id: restauranteId })))
        .select('id, nombre');
    if (clientError) throw clientError;

    const { data: productRows, error: productError } = await supabase
        .from('productos')
        .insert(PRODUCTS.map((p) => ({
            restaurante_id: restauranteId,
            codigo: p.codigo,
            nombre: p.nombre,
            categoria: p.categoria,
            precio_unidad: p.precio_unidad,
            maneja_stock: p.maneja_stock,
            stock: p.stock,
            stock_minimo: p.stock_minimo
        })))
        .select('id, codigo');
    if (productError) throw productError;

    const productById = new Map(productRows.map((p) => [p.codigo, p]));
    const products = PRODUCTS.map((p) => ({ ...p, id: productById.get(p.codigo).id }));
    const groups = {
        plato: products.filter((p) => p.grupo === 'plato'),
        bebida: products.filter((p) => p.grupo === 'bebida'),
        aperitivo: products.filter((p) => p.grupo === 'aperitivo')
    };

    const { data: mesas, error: mesasError } = await supabase
        .from('mesas')
        .select('id, numero')
        .eq('restaurante_id', restauranteId)
        .order('id');
    if (mesasError) throw mesasError;
    if (!mesas || mesas.length === 0) throw new Error('El negocio demo no tiene mesas.');

    const today = dateInTimeZone(TIMEZONE, new Date());
    const plans = [];
    let saleIndex = 0;

    for (let dayOffset = DAYS; dayOffset >= 1; dayOffset -= 1) {
        const day = addDays(today, -dayOffset);
        const minutes = [];
        for (let m = 11 * 60; m <= 17 * 60; m += 1) minutes.push(m);
        for (let i = minutes.length - 1; i > 0; i -= 1) {
            const j = randInt(0, i);
            [minutes[i], minutes[j]] = [minutes[j], minutes[i]];
        }
        const times = minutes.slice(0, SALES_PER_DAY).sort((a, b) => a - b);

        times.forEach((saleMinute, index) => {
            const saleKey = `${day}-${String(index + 1).padStart(2, '0')}`;
            const checkoutMinute = saleMinute + randInt(25, 45);
            const itemCount = randInt(2, 5);
            const chosen = [];
            const used = new Set();

            while (chosen.length < itemCount) {
                const roll = Math.random();
                const pool = roll < 0.45 ? groups.plato : roll < 0.80 ? groups.bebida : groups.aperitivo;
                let available = pool.filter((p) => !used.has(p.codigo));
                if (available.length === 0) {
                    available = products.filter((p) => !used.has(p.codigo));
                }
                if (available.length === 0) break;
                const product = pick(available);
                used.add(product.codigo);
                chosen.push(product);
            }

            const items = chosen.map((product) => {
                const quantity = product.grupo === 'bebida' ? randInt(1, 3) : randInt(1, 2);
                return {
                    product,
                    quantity,
                    subtotal: round2(product.precio_unidad * quantity)
                };
            });

            plans.push({
                day,
                saleKey,
                saleMinute,
                checkoutMinute,
                items,
                total: round2(items.reduce((sum, item) => sum + item.subtotal, 0)),
                client: Math.random() < 0.7 ? pick(clientRows) : null,
                mesa: mesas[saleIndex % mesas.length],
                formaPago: Math.random() < 0.7 ? 'efectivo' : 'transferencia'
            });
            saleIndex += 1;
        });
    }

    const pedidoRows = plans.map((plan) => ({
        restaurante_id: restauranteId,
        mesa_id: plan.mesa.id,
        cliente_id: plan.client ? plan.client.id : null,
        estado: 'cerrado',
        total: plan.total,
        notas: `${SALE_MARKER}${plan.saleKey}`,
        created_at: localDateTime(plan.day, plan.saleMinute),
        updated_at: localDateTime(plan.day, plan.checkoutMinute)
    }));

    const insertedPedidos = await insertChunks('pedidos', pedidoRows, 50, 'id, notas');
    const pedidoIdByKey = new Map(
        insertedPedidos.map((p) => [String(p.notas).slice(SALE_MARKER.length), p.id])
    );

    const itemRows = [];
    for (const plan of plans) {
        const pedidoId = pedidoIdByKey.get(plan.saleKey);
        for (const item of plan.items) {
            itemRows.push({
                restaurante_id: restauranteId,
                pedido_id: pedidoId,
                producto_id: item.product.id,
                cantidad: item.quantity,
                unidad_medida: 'UND',
                precio_unitario: item.product.precio_unidad,
                subtotal: item.subtotal,
                estado: 'servido',
                enviado_at: localDateTime(plan.day, plan.saleMinute + 2),
                preparado_at: localDateTime(plan.day, plan.saleMinute + 8),
                listo_at: localDateTime(plan.day, plan.saleMinute + 15),
                servido_at: localDateTime(plan.day, plan.saleMinute + 20),
                created_at: localDateTime(plan.day, plan.saleMinute),
                updated_at: localDateTime(plan.day, plan.saleMinute + 20)
            });
        }
    }
    await insertChunks('pedido_items', itemRows, 100, 'id');

    const facturaRows = plans.map((plan) => ({
        restaurante_id: restauranteId,
        pedido_id: pedidoIdByKey.get(plan.saleKey),
        cliente_id: plan.client ? plan.client.id : null,
        fecha: localDateTime(plan.day, plan.checkoutMinute),
        total: plan.total,
        forma_pago: plan.formaPago,
        estado: 'activa',
        created_at: localDateTime(plan.day, plan.checkoutMinute)
    }));

    const insertedFacturas = await insertChunks('facturas', facturaRows, 50, 'id, pedido_id');
    const facturaIdByPedido = new Map(insertedFacturas.map((f) => [f.pedido_id, f.id]));

    const detailRows = [];
    for (const plan of plans) {
        const pedidoId = pedidoIdByKey.get(plan.saleKey);
        const facturaId = facturaIdByPedido.get(pedidoId);
        for (const item of plan.items) {
            detailRows.push({
                restaurante_id: restauranteId,
                factura_id: facturaId,
                producto_id: item.product.id,
                cantidad: item.quantity,
                precio_unitario: item.product.precio_unidad,
                unidad_medida: 'UND',
                subtotal: item.subtotal
            });
        }
    }
    await insertChunks('detalle_factura', detailRows, 100, 'id');

    const { data: facturas, error: facturasError } = await supabase
        .from('facturas')
        .select('fecha, total')
        .eq('restaurante_id', restauranteId);
    if (facturasError) throw facturasError;

    const byDay = new Map();
    for (const factura of facturas || []) {
        const day = dateInTimeZone(TIMEZONE, new Date(factura.fecha));
        const current = byDay.get(day) || { count: 0, total: 0 };
        current.count += 1;
        current.total += Number(factura.total || 0);
        byDay.set(day, current);
    }

    const todayCount = byDay.get(today)?.count || 0;
    if (todayCount !== 0) {
        throw new Error(`Se esperaban 0 ventas hoy (${today}), pero hay ${todayCount}.`);
    }

    console.log('========================================');
    console.log('DATOS DE VENTAS CREADOS');
    console.log('  Negocio:          ', demo.codigo_negocio, `(id ${restauranteId})`);
    console.log('  Clientes:         ', clientRows.length);
    console.log('  Productos:        ', productRows.length, '(10 platos, 10 bebidas, 10 aperitivos)');
    console.log('  Ventas:           ', plans.length, `(${SALES_PER_DAY}/día x ${DAYS} días)`);
    console.log('  Hoy:              ', todayCount, 'ventas (debe ser 0)');
    console.log('----------------------------------------');
    for (const [day, data] of [...byDay.entries()].sort()) {
        console.log(`  ${day}  ${String(data.count).padStart(2)} ventas  $${data.total.toFixed(2)}`);
    }
    console.log('========================================');
    console.log('Revisar en: /ventas, /reportes, /facturas, /clientes y /productos');
}

(async () => {
    try {
        const args = process.argv.slice(2);
        const demo = await getDemo();
        if (!demo) {
            console.error(`No existe el negocio ${DEMO_CODE}. Ejecutá primero: node scripts/seed-demo.js`);
            process.exit(1);
        }

        if (args.includes('--clean')) {
            await cleanup(demo.id);
            return;
        }

        const { count, error } = await supabase
            .from('pedidos')
            .select('*', { count: 'exact', head: true })
            .eq('restaurante_id', demo.id)
            .like('notas', `${SALE_MARKER}%`);
        if (error) throw error;

        if (count > 0 && !args.includes('--reset')) {
            console.error(`Ya existen ${count} pedidos demo. Usá --reset para borrarlos y regenerarlos.`);
            process.exit(1);
        }

        if (!args.includes('--reset') && count === 0) {
            const { count: orphanProducts, error: orphanError } = await supabase
                .from('productos')
                .select('*', { count: 'exact', head: true })
                .eq('restaurante_id', demo.id)
                .like('codigo', `${PRODUCT_PREFIX}%`);
            if (orphanError) throw orphanError;
            if (orphanProducts > 0) {
                console.log('Detecté productos demo sin ventas; limpiando antes de crear...');
                await cleanup(demo.id);
            }
        }

        if (args.includes('--reset')) {
            await cleanup(demo.id);
        }

        await seed(demo);
    } catch (error) {
        console.error('ERROR:', error.message);
        process.exit(1);
    }
})();
