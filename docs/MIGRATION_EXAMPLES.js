/**
 * EJEMPLOS DE MIGRACIÓN: MySQL → Supabase
 * 
 * Este archivo contiene ejemplos prácticos de cómo migrar
 * cada tipo de operación de tu aplicación actual.
 */

// ========================================
// EJEMPLO 1: QUERIES SIMPLES (SELECT)
// ========================================

// ❌ ANTES (MySQL):
/*
router.get('/productos', async (req, res) => {
    const [productos] = await pool.query(
        'SELECT * FROM productos WHERE restaurante_id = ?',
        [req.session.usuario.restaurante_id]
    );
    res.render('productos', { productos });
});
*/

// ✅ DESPUÉS (Supabase):
const { getProductos } = require('../config/supabase');

router.get('/productos', async (req, res) => {
    try {
        const restaurante_id = req.session.usuario.restaurante_id;
        const productos = await getProductos(restaurante_id);
        res.render('productos', { productos });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========================================
// EJEMPLO 2: INSERT (Crear registro)
// ========================================

// ❌ ANTES (MySQL):
/*
router.post('/productos', async (req, res) => {
    const { codigo, nombre, precio_unidad } = req.body;
    const restaurante_id = req.session.usuario.restaurante_id;
    
    const [result] = await pool.query(
        'INSERT INTO productos (restaurante_id, codigo, nombre, precio_unidad) VALUES (?, ?, ?, ?)',
        [restaurante_id, codigo, nombre, precio_unidad]
    );
    
    res.json({ success: true, id: result.insertId });
});
*/

// ✅ DESPUÉS (Supabase):
const { supabase } = require('../config/supabase');

router.post('/productos', async (req, res) => {
    try {
        const { codigo, nombre, precio_unidad, categoria } = req.body;
        const restaurante_id = req.session.usuario.restaurante_id;
        
        const { data, error } = await supabase
            .from('productos')
            .insert({
                restaurante_id,
                codigo,
                nombre,
                precio_unidad: parseFloat(precio_unidad),
                categoria: categoria || 'Cocina',
                maneja_stock: categoria === 'Bar' ? true : false
            })
            .select();
        
        if (error) throw error;
        
        res.json({ success: true, id: data[0].id });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ========================================
// EJEMPLO 3: UPDATE (Actualizar)
// ========================================

// ❌ ANTES (MySQL):
/*
router.put('/productos/:id', async (req, res) => {
    const { nombre, precio_unidad } = req.body;
    const producto_id = req.params.id;
    
    const [result] = await pool.query(
        'UPDATE productos SET nombre = ?, precio_unidad = ? WHERE id = ? AND restaurante_id = ?',
        [nombre, precio_unidad, producto_id, req.session.usuario.restaurante_id]
    );
    
    if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    res.json({ success: true });
});
*/

// ✅ DESPUÉS (Supabase):
router.put('/productos/:id', async (req, res) => {
    try {
        const { nombre, precio_unidad } = req.body;
        const producto_id = req.params.id;
        const restaurante_id = req.session.usuario.restaurante_id;
        
        const { data, error, count } = await supabase
            .from('productos')
            .update({
                nombre,
                precio_unidad: parseFloat(precio_unidad),
                updated_at: new Date().toISOString()
            })
            .eq('id', producto_id)
            .eq('restaurante_id', restaurante_id)
            .select();
        
        if (error) throw error;
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ========================================
// EJEMPLO 4: DELETE (Eliminar)
// ========================================

// ❌ ANTES (MySQL):
/*
router.delete('/productos/:id', async (req, res) => {
    const [result] = await pool.query(
        'DELETE FROM productos WHERE id = ? AND restaurante_id = ?',
        [req.params.id, req.session.usuario.restaurante_id]
    );
    
    res.json({ success: result.affectedRows > 0 });
});
*/

// ✅ DESPUÉS (Supabase):
router.delete('/productos/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('productos')
            .delete()
            .eq('id', req.params.id)
            .eq('restaurante_id', req.session.usuario.restaurante_id);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ========================================
// EJEMPLO 5: QUERIES CON JOIN
// ========================================

// ❌ ANTES (MySQL):
/*
router.get('/mesas/:id/pedidos', async (req, res) => {
    const [pedidos] = await pool.query(`
        SELECT p.*, pi.producto_id, pi.cantidad, pr.nombre 
        FROM pedidos p
        JOIN pedido_items pi ON p.id = pi.pedido_id
        JOIN productos pr ON pi.producto_id = pr.id
        WHERE p.mesa_id = ? AND p.restaurante_id = ? AND p.estado = 'abierto'
    `, [req.params.id, req.session.usuario.restaurante_id]);
    
    res.json(pedidos);
});
*/

// ✅ DESPUÉS (Supabase):
router.get('/mesas/:id/pedidos', async (req, res) => {
    try {
        const mesa_id = req.params.id;
        const restaurante_id = req.session.usuario.restaurante_id;
        
        const { data, error } = await supabase
            .from('pedidos')
            .select(`
                *,
                pedido_items(
                    *,
                    productos(nombre, precio_unidad)
                )
            `)
            .eq('mesa_id', mesa_id)
            .eq('restaurante_id', restaurante_id)
            .eq('estado', 'abierto');
        
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ========================================
// EJEMPLO 6: TRANSACCIONES
// ========================================

// ❌ ANTES (MySQL):
/*
router.post('/pedidos/:id/facturar', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        // 1. Crear factura
        const [factura] = await connection.query(
            'INSERT INTO facturas (restaurante_id, cliente_id, total) VALUES (?, ?, ?)',
            [restaurante_id, cliente_id, total]
        );
        
        // 2. Copiar items a detalle_factura
        await connection.query(
            'INSERT INTO detalle_factura SELECT NULL, ?, id, producto_id, cantidad, precio_unitario FROM pedido_items WHERE pedido_id = ?',
            [restaurante_id, factura.insertId, pedido_id]
        );
        
        // 3. Cerrar pedido
        await connection.query(
            'UPDATE pedidos SET estado = "cerrado" WHERE id = ?',
            [pedido_id]
        );
        
        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        res.status(400).json({ error: error.message });
    } finally {
        connection.release();
    }
});
*/

// ✅ DESPUÉS (Supabase):
// Nota: Supabase no tiene transacciones nativas en JS,
// pero puede hacerlo con funciones SQL (PL/pgSQL) o RPC
router.post('/pedidos/:id/facturar', async (req, res) => {
    try {
        const pedido_id = req.params.id;
        const restaurante_id = req.session.usuario.restaurante_id;
        
        // Opción 1: Crear función en Supabase y llamarla
        // const { data, error } = await supabase
        //     .rpc('facturar_pedido', { p_pedido_id: pedido_id })
        
        // Opción 2: Hacer requests secuenciales (menos seguro)
        // Obtener pedido con items
        const { data: pedido } = await supabase
            .from('pedidos')
            .select('*, pedido_items(*)')
            .eq('id', pedido_id)
            .eq('restaurante_id', restaurante_id)
            .single();
        
        // Crear factura
        const { data: factura, error: e1 } = await supabase
            .from('facturas')
            .insert({
                restaurante_id,
                cliente_id: pedido.cliente_id,
                total: pedido.total,
                forma_pago: 'efectivo',
                estado: 'activa'
            })
            .select()
            .single();
        
        if (e1) throw e1;
        
        // Copiar items a detalle_factura
        const detalles = pedido.pedido_items.map(item => ({
            restaurante_id,
            factura_id: factura.id,
            producto_id: item.producto_id,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            subtotal: item.subtotal
        }));
        
        const { error: e2 } = await supabase
            .from('detalle_factura')
            .insert(detalles);
        
        if (e2) throw e2;
        
        // Actualizar estado del pedido
        const { error: e3 } = await supabase
            .from('pedidos')
            .update({ estado: 'cerrado' })
            .eq('id', pedido_id);
        
        if (e3) throw e3;
        
        res.json({ success: true, factura_id: factura.id });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ========================================
// EJEMPLO 7: AGGREGATION (SUM, COUNT)
// ========================================

// ❌ ANTES (MySQL):
/*
router.get('/reportes/hoy', async (req, res) => {
    const [reportes] = await pool.query(`
        SELECT 
            COUNT(*) as total_facturas,
            SUM(total) as total_ventas,
            AVG(total) as promedio
        FROM facturas
        WHERE restaurante_id = ? AND DATE(fecha) = CURDATE()
    `, [req.session.usuario.restaurante_id]);
    
    res.json(reportes[0]);
});
*/

// ✅ DESPUÉS (Supabase):
router.get('/reportes/hoy', async (req, res) => {
    try {
        const restaurante_id = req.session.usuario.restaurante_id;
        const hoy = new Date().toISOString().split('T')[0];
        
        const { data, error } = await supabase
            .from('facturas')
            .select('total')
            .eq('restaurante_id', restaurante_id)
            .gte('fecha', `${hoy}T00:00:00`)
            .lte('fecha', `${hoy}T23:59:59`);
        
        if (error) throw error;
        
        const reportes = {
            total_facturas: data.length,
            total_ventas: data.reduce((sum, f) => sum + (f.total || 0), 0),
            promedio: data.length > 0 
                ? data.reduce((sum, f) => sum + (f.total || 0), 0) / data.length
                : 0
        };
        
        res.json(reportes);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ========================================
// EJEMPLO 8: PAGINACIÓN
// ========================================

// ❌ ANTES (MySQL):
/*
router.get('/facturas', async (req, res) => {
    const page = req.query.page || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    
    const [facturas] = await pool.query(`
        SELECT * FROM facturas 
        WHERE restaurante_id = ? 
        ORDER BY fecha DESC 
        LIMIT ? OFFSET ?
    `, [req.session.usuario.restaurante_id, limit, offset]);
    
    res.json(facturas);
});
*/

// ✅ DESPUÉS (Supabase):
router.get('/facturas', async (req, res) => {
    try {
        const restaurante_id = req.session.usuario.restaurante_id;
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const offset = (page - 1) * limit;
        
        const { data, error, count } = await supabase
            .from('facturas')
            .select('*', { count: 'exact' })
            .eq('restaurante_id', restaurante_id)
            .order('fecha', { ascending: false })
            .range(offset, offset + limit - 1);
        
        if (error) throw error;
        
        res.json({
            data,
            total: count,
            pages: Math.ceil(count / limit),
            current_page: page
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ========================================
// EJEMPLO 9: BÚSQUEDA CON FILTROS
// ========================================

// ❌ ANTES (MySQL):
/*
router.get('/clientes/buscar', async (req, res) => {
    const { nombre, telefono } = req.query;
    
    let query = 'SELECT * FROM clientes WHERE restaurante_id = ?';
    const params = [req.session.usuario.restaurante_id];
    
    if (nombre) {
        query += ' AND nombre LIKE ?';
        params.push(`%${nombre}%`);
    }
    if (telefono) {
        query += ' AND telefono LIKE ?';
        params.push(`%${telefono}%`);
    }
    
    const [clientes] = await pool.query(query, params);
    res.json(clientes);
});
*/

// ✅ DESPUÉS (Supabase):
router.get('/clientes/buscar', async (req, res) => {
    try {
        const restaurante_id = req.session.usuario.restaurante_id;
        const { nombre, telefono } = req.query;
        
        let query = supabase
            .from('clientes')
            .select('*')
            .eq('restaurante_id', restaurante_id);
        
        if (nombre) {
            query = query.ilike('nombre', `%${nombre}%`);  // ilike = case-insensitive
        }
        if (telefono) {
            query = query.ilike('telefono', `%${telefono}%`);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ========================================
// EJEMPLO 10: ACTUALIZAR STOCK
// ========================================

// ❌ ANTES (MySQL):
/*
router.post('/productos/:id/decrementar-stock', async (req, res) => {
    const { cantidad } = req.body;
    
    const [result] = await pool.query(
        'UPDATE productos SET stock = stock - ? WHERE id = ? AND restaurante_id = ? AND maneja_stock = 1',
        [cantidad, req.params.id, req.session.usuario.restaurante_id]
    );
    
    if (result.affectedRows === 0) {
        return res.status(400).json({ error: 'Stock insuficiente' });
    }
    
    res.json({ success: true });
});
*/

// ✅ DESPUÉS (Supabase):
router.post('/productos/:id/decrementar-stock', async (req, res) => {
    try {
        const { cantidad } = req.body;
        const producto_id = req.params.id;
        const restaurante_id = req.session.usuario.restaurante_id;
        
        // Obtener stock actual
        const { data: producto, error: e1 } = await supabase
            .from('productos')
            .select('stock, maneja_stock')
            .eq('id', producto_id)
            .eq('restaurante_id', restaurante_id)
            .single();
        
        if (e1) throw e1;
        
        if (!producto.maneja_stock || producto.stock < cantidad) {
            return res.status(400).json({ error: 'Stock insuficiente' });
        }
        
        // Decrementar stock
        const { error: e2 } = await supabase
            .from('productos')
            .update({ stock: producto.stock - cantidad })
            .eq('id', producto_id);
        
        if (e2) throw e2;
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ========================================
// RESUMEN DE CAMBIOS
// ========================================

/*
CAMBIOS PRINCIPALES AL MIGRAR A SUPABASE:

1. IMPORTS:
   ❌ const pool = require('../config/database');
   ✅ const { supabase, query } = require('../config/supabase');

2. QUERIES:
   ❌ const [datos] = await pool.query(sql, params);
   ✅ const { data, error } = await supabase.from(table).select();

3. ERROR HANDLING:
   ❌ Verificar result.affectedRows
   ✅ Verificar if (error)

4. MULTI-TENANT:
   ❌ WHERE restaurante_id = ? en cada query
   ✅ Seguir haciendo pero con .eq('restaurante_id', id)

5. TRANSACCIONES:
   ❌ connection.beginTransaction()
   ✅ Hacer requests secuenciales o usar RPC/Functions

6. RETURNED VALUES:
   ❌ result.insertId
   ✅ data[0].id (con .select())

7. SYNTAX:
   ❌ LIMIT ? OFFSET ?
   ✅ .range(offset, offset + limit - 1)

8. BÚSQUEDA:
   ❌ LIKE '%value%'
   ✅ .ilike('column', '%value%')
*/
