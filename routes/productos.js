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

const normalizarProducto = (body, restauranteId, codigo) => {
    const categoria = normalizarCategoria(body.categoria);
    const manejaStock = categoria === 'Bar';

    return {
        restaurante_id: restauranteId,
        codigo,
        nombre: String(body.nombre || '').trim(),
        precio_unidad: parseFloat(body.precio_unidad) || 0,
        categoria,
        maneja_stock: manejaStock,
        stock: manejaStock ? (parseFloat(body.stock) || 0) : 0,
        stock_minimo: manejaStock ? (parseFloat(body.stock_minimo) || 0) : 0,
        updated_at: new Date().toISOString()
    };
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

        const { data: productos, error } = await supabase
            .from('productos')
            .select('*')
            .eq('restaurante_id', restauranteId)
            .order('nombre', { ascending: true });

        if (error) throw error;

        res.render('productos', { productos: productos || [] });
    } catch (error) {
        console.error('Error al cargar inventario:', error);
        res.status(500).render('error', { error: { message: 'Error al cargar inventario' } });
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
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ message: 'Producto creado con exito', codigo: data.codigo, id: data.id });
    } catch (error) {
        console.error('Error al crear producto:', error);
        res.status(500).json({
            error: 'Error al guardar el producto',
            detalle: error.message
        });
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
        const texto = String(req.query.q || '').trim().replace(/[,%]/g, '');

        let consulta = supabase
            .from('productos')
            .select('id, codigo, nombre, precio_unidad')
            .eq('restaurante_id', restauranteId)
            .limit(10);

        if (texto) {
            consulta = consulta.or(`nombre.ilike.%${texto}%,codigo.ilike.%${texto}%`);
        }

        const { data: productos, error } = await consulta.order('nombre', { ascending: true });

        if (error) throw error;

        res.json(productos || []);
    } catch (error) {
        console.error('Error en buscador:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;
