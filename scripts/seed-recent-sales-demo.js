/**
 * Inserta exactamente 10 ventas demo ayer y 10 hoy en DEMO01, sin alterar
 * ventas existentes. Cada registro queda identificado con [demo-recent].
 *
 * Uso: node scripts/seed-recent-sales-demo.js
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
const MARKER = '[demo-recent]';
const SALES_PER_DAY = 10;

function addDays(day, offset) {
    const date = new Date(`${day}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
}

function localDateTime(day, hour, minute) {
    return `${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

async function main() {
    const { data: restaurant, error: restaurantError } = await supabase
        .from('restaurantes')
        .select('id, codigo_negocio')
        .eq('codigo_negocio', DEMO_CODE)
        .maybeSingle();
    if (restaurantError) throw restaurantError;
    if (!restaurant) throw new Error(`No existe el negocio ${DEMO_CODE}.`);

    const { count: existingCount, error: existingError } = await supabase
        .from('pedidos')
        .select('id', { count: 'exact', head: true })
        .eq('restaurante_id', restaurant.id)
        .like('notas', `${MARKER}%`);
    if (existingError) throw existingError;
    if ((existingCount || 0) > 0) throw new Error('Ya se cargaron las ventas demo recientes; no se duplicaron.');

    const { data: tables, error: tablesError } = await supabase
        .from('mesas')
        .select('id')
        .eq('restaurante_id', restaurant.id)
        .order('id')
        .limit(1);
    if (tablesError) throw tablesError;
    if (!tables?.length) throw new Error('El negocio demo no tiene mesas.');

    const { data: products, error: productsError } = await supabase
        .from('productos')
        .select('id, nombre, precio_unidad')
        .eq('restaurante_id', restaurant.id)
        .order('id')
        .limit(5);
    if (productsError) throw productsError;
    if (!products?.length) throw new Error('El negocio demo no tiene productos activos.');

    const today = dateInTimeZone(TIMEZONE, new Date());
    const days = [addDays(today, -1), today];
    const plans = days.flatMap((day, dayIndex) => Array.from({ length: SALES_PER_DAY }, (_, index) => {
        const product = products[(dayIndex * SALES_PER_DAY + index) % products.length];
        const quantity = (index % 3) + 1;
        const total = round2(Number(product.precio_unidad) * quantity);
        const hour = 11 + Math.floor(index / 2);
        const minute = index % 2 === 0 ? 10 : 40;
        return {
            day,
            key: `${day}-${String(index + 1).padStart(2, '0')}`,
            product,
            quantity,
            total,
            createdAt: localDateTime(day, hour, minute),
            closedAt: localDateTime(day, hour, minute + 15)
        };
    }));

    const { data: orders, error: ordersError } = await supabase
        .from('pedidos')
        .insert(plans.map((plan) => ({
            restaurante_id: restaurant.id,
            mesa_id: tables[0].id,
            estado: 'cerrado',
            total: plan.total,
            notas: `${MARKER} ${plan.key}`,
            created_at: plan.createdAt,
            updated_at: plan.closedAt
        })))
        .select('id, notas');
    if (ordersError) throw ordersError;

    const orderIdByKey = new Map(orders.map((order) => [order.notas.slice(`${MARKER} `.length), order.id]));
    const { error: itemError } = await supabase.from('pedido_items').insert(plans.map((plan) => ({
        restaurante_id: restaurant.id,
        pedido_id: orderIdByKey.get(plan.key),
        producto_id: plan.product.id,
        cantidad: plan.quantity,
        unidad_medida: 'UND',
        precio_unitario: plan.product.precio_unidad,
        subtotal: plan.total,
        estado: 'servido',
        created_at: plan.createdAt,
        updated_at: plan.closedAt
    })));
    if (itemError) throw itemError;

    const { data: invoices, error: invoiceError } = await supabase
        .from('facturas')
        .insert(plans.map((plan) => ({
            restaurante_id: restaurant.id,
            pedido_id: orderIdByKey.get(plan.key),
            fecha: plan.closedAt,
            total: plan.total,
            forma_pago: plan.quantity % 2 ? 'efectivo' : 'transferencia',
            estado: 'activa',
            created_at: plan.closedAt
        })))
        .select('id, pedido_id');
    if (invoiceError) throw invoiceError;

    const invoiceByOrderId = new Map(invoices.map((invoice) => [invoice.pedido_id, invoice.id]));
    const { error: detailError } = await supabase.from('detalle_factura').insert(plans.map((plan) => ({
        restaurante_id: restaurant.id,
        factura_id: invoiceByOrderId.get(orderIdByKey.get(plan.key)),
        producto_id: plan.product.id,
        cantidad: plan.quantity,
        precio_unitario: plan.product.precio_unidad,
        unidad_medida: 'UND',
        subtotal: plan.total
    })));
    if (detailError) throw detailError;

    console.log(`Ventas demo creadas: ${SALES_PER_DAY} para ${days[0]} y ${SALES_PER_DAY} para ${days[1]}.`);
}

main().catch((error) => {
    console.error('ERROR:', error.message);
    process.exit(1);
});
