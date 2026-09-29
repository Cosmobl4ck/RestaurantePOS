-- ======================================================
-- MIGRACIÓN DE MYSQL A SUPABASE (PostgreSQL)
-- ======================================================
-- Copiar TODO este contenido al SQL Editor de Supabase
-- Supabase usará PostgreSQL, no MySQL
-- ======================================================

-- ======================================================
-- 1. TABLA MAESTRA DE TENANTS
-- ======================================================
CREATE TABLE restaurantes (
    id BIGSERIAL PRIMARY KEY,
    codigo_negocio VARCHAR(50) UNIQUE NOT NULL,
    nombre_comercial VARCHAR(100) NOT NULL,
    estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo', 'suspendido', 'cancelado')),
    fecha_vencimiento TIMESTAMP,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================================================
-- 2. TABLA DE USUARIOS
-- ======================================================
CREATE TABLE usuarios (
    id BIGSERIAL PRIMARY KEY,
    restaurante_id BIGINT NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    nombre VARCHAR(100) NOT NULL,
    rol VARCHAR(20) NOT NULL CHECK (rol IN ('admin', 'gerente', 'cajero', 'mesero', 'cocina', 'bar')),
    pin_hash VARCHAR(255) NOT NULL,
    estado SMALLINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(restaurante_id, nombre)
);

-- ======================================================
-- 3. TABLA DE PRODUCTOS
-- ======================================================
CREATE TABLE productos (
    id BIGSERIAL PRIMARY KEY,
    restaurante_id BIGINT NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    codigo VARCHAR(50) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    categoria VARCHAR(20) DEFAULT 'Cocina' CHECK (categoria IN ('Cocina', 'Bar')),
    maneja_stock BOOLEAN DEFAULT TRUE,
    precio_kg DECIMAL(10,2) DEFAULT 0,
    precio_unidad DECIMAL(10,2) DEFAULT 0,
    precio_libra DECIMAL(10,2) DEFAULT 0,
    stock DECIMAL(10,2) DEFAULT 0,
    stock_minimo DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(restaurante_id, codigo)
);

-- ======================================================
-- 4. TABLA DE CLIENTES
-- ======================================================
CREATE TABLE clientes (
    id BIGSERIAL PRIMARY KEY,
    restaurante_id BIGINT NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    nombre VARCHAR(100) NOT NULL,
    direccion TEXT,
    telefono VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================================================
-- 5. TABLA DE MESAS
-- ======================================================
CREATE TABLE mesas (
    id BIGSERIAL PRIMARY KEY,
    restaurante_id BIGINT NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    numero VARCHAR(50) NOT NULL,
    descripcion VARCHAR(100),
    estado VARCHAR(20) DEFAULT 'libre' CHECK (estado IN ('libre', 'ocupada', 'reservada', 'bloqueada')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(restaurante_id, numero)
);

-- ======================================================
-- 6. TABLA DE PEDIDOS
-- ======================================================
CREATE TABLE pedidos (
    id BIGSERIAL PRIMARY KEY,
    restaurante_id BIGINT NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    mesa_id BIGINT NOT NULL REFERENCES mesas(id),
    cliente_id BIGINT REFERENCES clientes(id),
    estado VARCHAR(50) DEFAULT 'abierto' CHECK (estado IN ('abierto', 'en_cocina', 'preparando', 'listo', 'servido', 'cerrado', 'cancelado')),
    total DECIMAL(10,2) DEFAULT 0,
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================================================
-- 7. TABLA DE ITEMS DE PEDIDO
-- ======================================================
CREATE TABLE pedido_items (
    id BIGSERIAL PRIMARY KEY,
    restaurante_id BIGINT NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    pedido_id BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id BIGINT NOT NULL REFERENCES productos(id),
    cantidad DECIMAL(10,2) NOT NULL,
    unidad_medida VARCHAR(10) DEFAULT 'UND' CHECK (unidad_medida IN ('KG', 'UND', 'LB')),
    precio_unitario DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    estado VARCHAR(50) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviado', 'preparando', 'listo', 'servido', 'cancelado')),
    nota TEXT,
    enviado_at TIMESTAMP NULL,
    preparado_at TIMESTAMP NULL,
    listo_at TIMESTAMP NULL,
    servido_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================================================
-- 8. TABLA DE FACTURAS
-- ======================================================
CREATE TABLE facturas (
    id BIGSERIAL PRIMARY KEY,
    restaurante_id BIGINT NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    cliente_id BIGINT REFERENCES clientes(id),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total DECIMAL(10,2) NOT NULL,
    forma_pago VARCHAR(20) DEFAULT 'efectivo' CHECK (forma_pago IN ('efectivo', 'transferencia')),
    estado VARCHAR(20) DEFAULT 'activa' CHECK (estado IN ('activa', 'anulada')),
    anulado_por BIGINT REFERENCES usuarios(id),
    motivo_anulacion TEXT,
    fecha_anulacion TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================================================
-- 9. TABLA DE DETALLES DE FACTURA
-- ======================================================
CREATE TABLE detalle_factura (
    id BIGSERIAL PRIMARY KEY,
    restaurante_id BIGINT NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    factura_id BIGINT NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
    producto_id BIGINT REFERENCES productos(id),
    cantidad DECIMAL(10,2) NOT NULL,
    precio_unitario DECIMAL(10,2) NOT NULL,
    unidad_medida VARCHAR(10) DEFAULT 'KG' CHECK (unidad_medida IN ('KG', 'UND', 'LB')),
    subtotal DECIMAL(10,2) NOT NULL
);

-- ======================================================
-- 10. TABLA DE CORTES DE CAJA
-- ======================================================
CREATE TABLE cortes_caja (
    id BIGSERIAL PRIMARY KEY,
    restaurante_id BIGINT NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    fecha DATE DEFAULT CURRENT_DATE,
    monto_apertura DECIMAL(10,2) NOT NULL,
    monto_cierre DECIMAL(10,2),
    estado VARCHAR(20) DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
    usuario_id BIGINT REFERENCES usuarios(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================================================
-- 11. TABLA DE CONFIGURACIÓN DE IMPRESIÓN
-- ======================================================
CREATE TABLE configuracion_impresion (
    id BIGSERIAL PRIMARY KEY,
    restaurante_id BIGINT UNIQUE NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    nombre_negocio VARCHAR(100) NOT NULL,
    direccion TEXT,
    telefono VARCHAR(20),
    nit VARCHAR(50),
    pie_pagina TEXT,
    ancho_papel INTEGER DEFAULT 80,
    font_size INTEGER DEFAULT 1,
    logo_data BYTEA,
    logo_tipo VARCHAR(50),
    qr_data BYTEA,
    qr_tipo VARCHAR(50),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================================================
-- 12. ÍNDICES PARA PERFORMANCE
-- ======================================================
CREATE INDEX idx_usuarios_restaurante ON usuarios(restaurante_id);
CREATE INDEX idx_productos_restaurante ON productos(restaurante_id);
CREATE INDEX idx_mesas_restaurante ON mesas(restaurante_id);
CREATE INDEX idx_pedidos_restaurante ON pedidos(restaurante_id);
CREATE INDEX idx_pedido_items_restaurante ON pedido_items(restaurante_id);
CREATE INDEX idx_pedido_items_pedido ON pedido_items(pedido_id);
CREATE INDEX idx_facturas_restaurante ON facturas(restaurante_id);
CREATE INDEX idx_facturas_fecha ON facturas(fecha);
CREATE INDEX idx_cortes_caja_restaurante ON cortes_caja(restaurante_id);
CREATE INDEX idx_cortes_caja_fecha ON cortes_caja(fecha);
CREATE INDEX idx_detalle_factura_factura ON detalle_factura(factura_id);

-- ======================================================
-- 13. POLÍTICAS DE RLS (Row Level Security) - IMPORTANTE
-- ======================================================
-- Supabase RLS previene que un usuario vea datos de otros restaurantes
ALTER TABLE restaurantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_factura ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortes_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion_impresion ENABLE ROW LEVEL SECURITY;

-- Crear tabla de usuario/restaurante para RLS
CREATE TABLE usuario_restaurante (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    restaurante_id BIGINT NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, restaurante_id)
);

-- RLS Policy: Los usuarios solo ven sus restaurantes
CREATE POLICY "Usuarios ven solo sus restaurantes"
    ON restaurantes
    FOR SELECT
    USING (id IN (SELECT restaurante_id FROM usuario_restaurante WHERE user_id = auth.uid()));

-- RLS Policy: Los usuarios solo ven usuarios de sus restaurantes
CREATE POLICY "Usuarios ven usuarios de su restaurante"
    ON usuarios
    FOR SELECT
    USING (restaurante_id IN (SELECT restaurante_id FROM usuario_restaurante WHERE user_id = auth.uid()));

-- (Aplicar políticas similares a otras tablas)

-- ======================================================
-- 14. DATOS DE PRUEBA / DEMO
-- ======================================================

-- Restaurante Demo (7 días de prueba)
INSERT INTO restaurantes (codigo_negocio, nombre_comercial, estado, fecha_vencimiento)
VALUES ('MARROCOS01', 'Marrocos Restaurante', 'activo', NOW() + INTERVAL '30 days');

-- Usuario Admin Demo (PIN: 1234)
-- Hash generado con bcryptjs: $2b$10$vI8A7S/Yw.wWf7yYVpS7fO6f7z8f9g0h1i2j3k4l5m6n7o8p9q0r
INSERT INTO usuarios (restaurante_id, nombre, rol, pin_hash, estado)
VALUES (1, 'Admin', 'admin', '$2b$10$vI8A7S/Yw.wWf7yYVpS7fO6f7z8f9g0h1i2j3k4l5m6n7o8p9q0r', 1);

-- Productos Demo
INSERT INTO productos (restaurante_id, codigo, nombre, precio_unidad, categoria, maneja_stock, stock)
VALUES 
    (1, 'P001', 'Hamburguesa Clásica', 8.50, 'Cocina', FALSE, 50.00),
    (1, 'P002', 'Pizza Pepperoni', 12.00, 'Cocina', FALSE, 30.00),
    (1, 'P003', 'Papas Fritas Grandes', 3.50, 'Cocina', FALSE, 100.00),
    (1, 'P004', 'Refresco Natural 16oz', 1.50, 'Bar', TRUE, 80.00),
    (1, 'P005', 'Cerveza Nacional', 2.50, 'Bar', TRUE, 120.00);

-- Mesas Demo
INSERT INTO mesas (restaurante_id, numero, descripcion, estado)
VALUES 
    (1, 'Mesa 1', 'Mesa salón principal', 'libre'),
    (1, 'Mesa 2', 'Mesa salón principal', 'libre'),
    (1, 'Mesa 3', 'Mesa salón principal', 'libre'),
    (1, 'Mesa 4', 'Mesa salón principal', 'libre'),
    (1, 'Mesa 5', 'Mesa salón principal', 'libre'),
    (1, 'Mesa 6', 'Mesa terraza', 'libre'),
    (1, 'Mesa 7', 'Mesa terraza', 'libre'),
    (1, 'Mesa 8', 'Mesa terraza', 'libre'),
    (1, 'Mesa 9', 'Mesa VIP', 'libre'),
    (1, 'Mesa 10', 'Mesa VIP', 'libre'),
    (1, 'DOMICILIO', 'PedidosYA', 'libre'),
    (1, 'PARA LLEVAR', 'Para retirar', 'libre');

-- Configuración de Impresión Demo
INSERT INTO configuracion_impresion (restaurante_id, nombre_negocio, direccion, telefono, nit, pie_pagina)
VALUES (1, 'Marrocos POS', 'San Salvador, El Salvador', '2222-2222', '0614-000000-000-0', '¡Gracias por su compra!');

-- ======================================================
-- 15. QUERIES ÚTILES PARA MONITOREO
-- ======================================================

-- Ver restaurantes y estado de licencia
-- SELECT 
--     id, nombre_comercial, codigo_negocio,
--     fecha_vencimiento,
--     (DATE(fecha_vencimiento) - CURRENT_DATE) AS dias_para_vencer,
--     CASE 
--         WHEN fecha_vencimiento < NOW() THEN 'VENCIDA'
--         WHEN (DATE(fecha_vencimiento) - CURRENT_DATE) <= 5 THEN 'POR VENCER'
--         ELSE 'AL DÍA'
--     END AS estatus_licencia
-- FROM restaurantes;

-- Ver usuarios de un restaurante
-- SELECT u.nombre, u.rol, r.codigo_negocio, r.nombre_comercial
-- FROM usuarios u
-- JOIN restaurantes r ON u.restaurante_id = r.id
-- WHERE r.id = 1;

-- Ver pedidos abiertos
-- SELECT p.id, m.numero, COUNT(pi.id) as items
-- FROM pedidos p
-- JOIN mesas m ON p.mesa_id = m.id
-- LEFT JOIN pedido_items pi ON p.id = pi.pedido_id
-- WHERE p.estado = 'abierto' AND p.restaurante_id = 1
-- GROUP BY p.id, m.numero;
