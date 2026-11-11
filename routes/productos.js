const express = require('express');
const router = express.Router();
const multer = require('multer');
const excel = require('exceljs');
const { supabase } = require('../config/supabase');
const { hasXlsxSignature, uploadErrorMiddleware } = require('../utils/upload-security');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 20, fieldSize: 256 * 1024, fieldArrayIndexLimit: 100 },
    fileFilter: (req, file, cb) => {
        const okExt = /\.xlsx$/i.test(file.originalname || '');
        const okMime = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/octet-stream'].includes(file.mimetype);
        cb(okExt && okMime ? null : new Error('Solo se permiten archivos .xlsx'), okExt && okMime);
    }
});

const getRestauranteId = (req) => req.session && req.session.usuario && req.session.usuario.restaurante_id;

const normalizarCategoria = (categoria) => {
    return String(categoria || '').toLowerCase() === 'bar' ? 'Bar' : 'Cocina';
};

const esFaltaEsquema = (error) => {
    return ['42P01', '42703', 'PGRST200', 'PGRST204', 'PGRST205'].includes(error?.code)
        || /column|relation|schema cache/i.test(error?.message || '');
};

const normalizarTiempoPreparacion = (valor) => {
    const minutos = Number(valor);
    return Number.isInteger(minutos) && minutos >= 1 && minutos <= 240 ? minutos : null;
};

const normalizarAlergenos = (valor) => {
    if (!Array.isArray(valor)) return [];
    return [...new Set(
        valor
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0)
    )];
};

const mapearAlergenos = (producto) => {
    const relaciones = Array.isArray(producto.producto_alergenos) ? producto.producto_alergenos : [];
    const alergenos = relaciones
        .map((relacion) => relacion.alergenos)
        .filter(Boolean)
        .map((alergeno) => ({
            id: Number(alergeno.id),
            nombre: String(alergeno.nombre || '')
        }))
        .filter((alergeno) => alergeno.id && alergeno.nombre);

    return {
        ...producto,
        alergenos,
        alergeno_ids: alergenos.map((alergeno) => alergeno.id)
    };
};

const normalizarProducto = (body, restauranteId, codigo) => {
    const categoria = normalizarCategoria(body.categoria);
    const manejaStock = categoria === 'Bar';

    return {
        restaurante_id: restauranteId,
        codigo: String(codigo || '').trim().slice(0, 40),
        nombre: String(body.nombre || '').trim().slice(0, 120),
        precio_unidad: Math.max(0, parseFloat(body.precio_unidad) || 0),
        categoria,
        maneja_stock: manejaStock,
        stock: manejaStock ? Math.max(0, parseFloat(body.stock) || 0) : 0,
        stock_minimo: manejaStock ? Math.max(0, parseFloat(body.stock_minimo) || 0) : 0,
        descripcion_corta: String(body.descripcion_corta || '').trim().slice(0, 500) || null,
        ingredientes: String(body.ingredientes || '').trim().slice(0, 2000) || null,
        tiempo_preparacion_minutos: normalizarTiempoPreparacion(body.tiempo_preparacion_minutos),
        updated_at: new Date().toISOString()
    };
};

const listarAlergenos = async () => {
    const { data, error } = await supabase
        .from('alergenos')
        .select('id, nombre, icono')
        .eq('activo', true)
        .order('nombre', { ascending: true });

    if (error) {
        if (esFaltaEsquema(error)) return [];
        throw error;
    }

    return data || [];
};

const cargarProductos = async (restauranteId) => {
    const consultaCompleta = supabase
        .from('productos')
        .select('*, producto_alergenos(alergenos(id,nombre))')
        .eq('restaurante_id', restauranteId)
        .order('nombre', { ascending: true });

    let { data, error } = await consultaCompleta;

    // Permite arrancar el POS antes de aplicar la migración de alérgenos.
    if (error && esFaltaEsquema(error)) {
        ({ data, error } = await supabase
            .from('productos')
            .select('*')
            .eq('restaurante_id', restauranteId)
            .order('nombre', { ascending: true }));

        if (error) throw error;
        return (data || []).map((producto) => ({ ...producto, alergenos: [], alergeno_ids: [] }));
    }

    if (error) throw error;
    return (data || []).map(mapearAlergenos);
};

const sincronizarAlergenos = async (restauranteId, productoId, alergenos) => {
    const { error } = await supabase.rpc('pos_sync_product_allergens', {
        p_restaurante_id: Number(restauranteId),
        p_producto_id: Number(productoId),
        p_alergeno_ids: normalizarAlergenos(alergenos)
    });

    if (error) throw error;
};

const buscarProductos = async (restauranteId, texto) => {
    const consultaCompleta = supabase
        .from('productos')
        .select('id, codigo, nombre, precio_unidad, descripcion_corta, ingredientes, tiempo_preparacion_minutos, producto_alergenos(alergenos(id,nombre))')
        .eq('restaurante_id', restauranteId)
        .limit(10);

    if (texto) {
        consultaCompleta.or(`nombre.ilike.%${texto}%,codigo.ilike.%${texto}%`);
    }

    let { data, error } = await consultaCompleta.order('nombre', { ascending: true });

    if (error && esFaltaEsquema(error)) {
        const consultaBase = supabase
            .from('productos')
            .select('id, codigo, nombre, precio_unidad')
            .eq('restaurante_id', restauranteId)
            .limit(10);

        if (texto) {
            consultaBase.or(`nombre.ilike.%${texto}%,codigo.ilike.%${texto}%`);
        }

        ({ data, error } = await consultaBase.order('nombre', { ascending: true }));
        if (error) throw error;

        return (data || []).map((producto) => ({
            ...producto,
            descripcion_corta: null,
            ingredientes: null,
            tiempo_preparacion_minutos: null,
            alergenos: []
        }));
    }

    if (error) throw error;

    return (data || []).map((producto) => {
        const relaciones = Array.isArray(producto.producto_alergenos) ? producto.producto_alergenos : [];
        const alergenos = relaciones
            .map((relacion) => relacion.alergenos?.nombre)
            .filter(Boolean);

        return {
            id: producto.id,
            codigo: producto.codigo,
            nombre: producto.nombre,
            precio_unidad: producto.precio_unidad,
            descripcion_corta: producto.descripcion_corta || null,
            ingredientes: producto.ingredientes || null,
            tiempo_preparacion_minutos: producto.tiempo_preparacion_minutos ?? null,
            alergenos
        };
    });
};

const generarCodigo = async (restauranteId, categoria) => {
    const prefijo = categoria === 'Bar' ? 'B' : 'C';

    const { data, error } = await supabase
        .from('productos')
        .select('codigo')
        .eq('restaurante_id', restauranteId)
        .like('codigo', `${prefijo}%`)
        .order('id', { ascending: false })
        .limit(1);

    if (error) throw error;

    let numero = 1;
    if (data && data.length > 0) {
        const soloNumeros = String(data[0].codigo || '').replace(/[^0-9]/g, '');
        numero = (parseInt(soloNumeros, 10) || 0) + 1;
    }

    return `${prefijo}${numero.toString().padStart(3, '0')}`;
};

// ==========================================
// 1. VISTA PRINCIPAL
// ==========================================
router.get('/', async (req, res) => {
    try {
        const restauranteId = getRestauranteId(req);
        const [productos, alergenos] = await Promise.all([
            cargarProductos(restauranteId),
            listarAlergenos()
        ]);

        res.render('productos', { productos, alergenos });
    } catch (error) {
        console.error('Error al cargar inventario:', error);
        res.status(500).render('error', { error: { message: 'Error al cargar inventario' } });
    }
});

router.get('/alergenos', async (req, res) => {
    try {
        res.json(await listarAlergenos());
    } catch (error) {
        console.error('Error al cargar alérgenos:', error);
        res.status(500).json({ error: 'Error al cargar alérgenos' });
    }
});

// ==========================================
// 2. CREAR PRODUCTO
// ==========================================
router.post('/', async (req, res) => {
    try {
        const restauranteId = getRestauranteId(req);
        const categoria = normalizarCategoria(req.body.categoria);
        let codigo = String(req.body.codigo || '').trim();

        if (!codigo || codigo === 'Automatico') {
            codigo = await generarCodigo(restauranteId, categoria);
        }

        const producto = normalizarProducto(req.body, restauranteId, codigo);

        const { data, error } = await supabase
            .from('productos')
            .insert(producto)
            .select('id, codigo')
            .single();

        if (error) throw error;

        if (req.body.alergenos !== undefined) {
            await sincronizarAlergenos(restauranteId, data.id, req.body.alergenos);
        }

        res.status(201).json({ message: 'Producto creado con exito', codigo: data.codigo, id: data.id });
    } catch (error) {
        console.error('Error al crear producto:', error.message);
        res.status(500).json({ error: 'Error al guardar el producto' });
    }
});

// ==========================================
// 3. ACTUALIZAR PRODUCTO
// ==========================================
router.put('/:id', async (req, res) => {
    try {
        const restauranteId = getRestauranteId(req);
        const codigo = String(req.body.codigo || '').trim();
        const producto = normalizarProducto(req.body, restauranteId, codigo);

        delete producto.restaurante_id;

        const { data, error } = await supabase
            .from('productos')
            .update(producto)
            .eq('id', req.params.id)
            .eq('restaurante_id', restauranteId)
            .select('id');

        if (error) throw error;
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        if (req.body.alergenos !== undefined) {
            await sincronizarAlergenos(restauranteId, data[0].id, req.body.alergenos);
        }

        res.json({ message: 'Producto actualizado con exito' });
    } catch (error) {
        console.error('Error al actualizar:', error);
        res.status(500).json({ error: 'Error al actualizar el producto' });
    }
});

// ==========================================
// 4. ELIMINAR PRODUCTO
// ==========================================
router.delete('/:id', async (req, res) => {
    try {
        const restauranteId = getRestauranteId(req);

        const { data, error } = await supabase
            .from('productos')
            .delete()
            .eq('id', req.params.id)
            .eq('restaurante_id', restauranteId)
            .select('id');

        if (error) throw error;
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        res.json({ message: 'Producto eliminado' });
    } catch (error) {
        console.error('Error al eliminar:', error);
        res.status(500).json({ error: 'Error al eliminar' });
    }
});

// ==========================================
// 5. EXCEL: PLANTILLA E IMPORTACION
// ==========================================
router.get('/plantilla', async (req, res) => {
    const workbook = new excel.Workbook();
    const sheet = workbook.addWorksheet('Productos');

    sheet.columns = [
        { header: 'codigo', key: 'codigo', width: 15 },
        { header: 'nombre', key: 'nombre', width: 30 },
        { header: 'precio_unidad', key: 'precio_unidad', width: 15 },
        { header: 'categoria', key: 'categoria', width: 15 },
        { header: 'stock', key: 'stock', width: 10 },
        { header: 'stock_minimo', key: 'stock_minimo', width: 15 }
    ];

    sheet.addRow({ codigo: 'B001', nombre: 'Ejemplo Bar', precio_unidad: 2.50, categoria: 'Bar', stock: 10, stock_minimo: 5 });
    sheet.addRow({ codigo: 'C001', nombre: 'Ejemplo Cocina', precio_unidad: 5.00, categoria: 'Cocina', stock: 0, stock_minimo: 0 });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=plantilla_productos.xlsx');
    await workbook.xlsx.write(res);
    res.end();
});

router.post('/importar', uploadErrorMiddleware(upload.single('archivo')), async (req, res) => {
    try {
        const restauranteId = getRestauranteId(req);

        if (!req.file) {
            return res.status(400).json({ error: 'No se recibio ningun archivo' });
        }
        if (!hasXlsxSignature(req.file.buffer)) {
            return res.status(400).json({ error: 'El archivo XLSX no es valido.' });
        }

        const workbook = new excel.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const sheet = workbook.getWorksheet(1);
        if (!sheet) return res.status(400).json({ error: 'El archivo no contiene hojas.' });
        // Tope defensivo: evita archivos comprimidos que expanden a millones de filas.
        if (sheet.rowCount > 2000) {
            return res.status(400).json({ error: 'El archivo supera el máximo de 2000 filas.' });
        }
        const productos = [];

        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;

            const categoria = normalizarCategoria(row.getCell(4).value);
            const codigo = String(row.getCell(1).value || '').trim();
            const nombre = String(row.getCell(2).value || '').trim();

            if (!codigo || !nombre) return;

            productos.push(normalizarProducto({
                nombre,
                precio_unidad: row.getCell(3).value,
                categoria,
                stock: row.getCell(5).value,
                stock_minimo: row.getCell(6).value
            }, restauranteId, codigo));
        });

        if (productos.length === 0) {
            return res.status(400).json({ error: 'El archivo no contiene productos validos' });
        }

        const { error } = await supabase
            .from('productos')
            .upsert(productos, { onConflict: 'restaurante_id,codigo' });

        if (error) throw error;

        res.json({ message: 'Importacion finalizada', total: productos.length });
    } catch (error) {
        console.error('Error al importar Excel:', error.message);
        res.status(400).json({ error: 'El archivo XLSX no se pudo procesar.' });
    }
});

// ==========================================
// 6. BUSCADOR
// ==========================================
router.get('/buscar', async (req, res) => {
    try {
        const restauranteId = getRestauranteId(req);
        // Allowlist: evita inyección de operadores en el filtro PostgREST.
        const texto = String(req.query.q || '').trim().replace(/[^\p{L}\p{N}\s_-]/gu, '').slice(0, 60);

        res.json(await buscarProductos(restauranteId, texto));
    } catch (error) {
        console.error('Error en buscador:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;
