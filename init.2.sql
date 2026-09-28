-- 1. PREPARACIÓN DE ENTORNO
DROP DATABASE IF EXISTS restaurante_caja;
CREATE DATABASE restaurante_caja;
USE restaurante_caja;

-- ======================================================
-- 2. TABLA MAESTRA DE TENANTS (Tus clientes SaaS)
-- ======================================================
CREATE TABLE restaurantes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre_comercial VARCHAR(100) NOT NULL,
    estado ENUM('activo', 'suspendido', 'cancelado') DEFAULT 'activo', -- Para controlar si pagan la mensualidad
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================================================
-- 3. TABLAS OPERATIVAS (Con restaurante_id)
-- ======================================================

-- TABLA DE USUARIOS
CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    restaurante_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    rol ENUM('admin', 'cajero', 'mesero') NOT NULL,
    pin_hash VARCHAR(255) NOT NULL,
    estado BOOLEAN DEFAULT 1, -- <--- FORMA MODERNA (Sin advertencias)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE CASCADE
);

-- TABLA DE PRODUCTOS
CREATE TABLE productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    restaurante_id INT NOT NULL, -- <--- NUEVO
    codigo VARCHAR(50) NOT NULL, 
    nombre VARCHAR(100) NOT NULL,
    categoria ENUM('Cocina', 'Bar') DEFAULT 'Cocina',
    maneja_stock BOOLEAN DEFAULT 1, 
    precio_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
    precio_unidad DECIMAL(10,2) NOT NULL DEFAULT 0,
    precio_libra DECIMAL(10,2) NOT NULL DEFAULT 0,
    stock DECIMAL(10,2) NOT NULL DEFAULT 0,
    stock_minimo DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    -- Quitamos el UNIQUE global de código, ahora el código es único POR restaurante
    UNIQUE KEY unique_codigo_por_restaurante (restaurante_id, codigo),
    FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE CASCADE
);

-- TABLA DE CLIENTES
CREATE TABLE clientes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    restaurante_id INT NOT NULL, -- <--- NUEVO
    nombre VARCHAR(100) NOT NULL,
    direccion TEXT,
    telefono VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE CASCADE
);

-- TABLA DE MESAS
CREATE TABLE mesas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    restaurante_id INT NOT NULL, -- <--- NUEVO
    numero VARCHAR(50) NOT NULL,
    descripcion VARCHAR(100),
    estado ENUM('libre', 'ocupada', 'reservada', 'bloqueada') DEFAULT 'libre',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    -- El número de mesa es único solo dentro de su propio restaurante
    UNIQUE KEY unique_mesa_por_restaurante (restaurante_id, numero),
    FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE CASCADE
);

-- TABLA DE PEDIDOS
CREATE TABLE pedidos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    restaurante_id INT NOT NULL, -- <--- NUEVO (Seguridad extra)
    mesa_id INT NOT NULL,
    cliente_id INT,
    estado ENUM('abierto', 'en_cocina', 'preparando', 'listo', 'servido', 'cerrado', 'cancelado') DEFAULT 'abierto',
    total DECIMAL(10,2) NOT NULL DEFAULT 0,
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE CASCADE,
    FOREIGN KEY (mesa_id) REFERENCES mesas(id),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

-- DETALLE DE PEDIDOS
CREATE TABLE pedido_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    restaurante_id INT NOT NULL, -- <--- NUEVO (Optimiza las consultas)
    pedido_id INT NOT NULL,
    producto_id INT NOT NULL,
    cantidad DECIMAL(10,2) NOT NULL,
    unidad_medida ENUM('KG', 'UND', 'LB') DEFAULT 'UND',
    precio_unitario DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    estado ENUM('pendiente', 'enviado', 'preparando', 'listo', 'servido', 'cancelado') DEFAULT 'pendiente',
    nota TEXT NULL,
    enviado_at TIMESTAMP NULL,  
    preparado_at TIMESTAMP NULL,
    listo_at TIMESTAMP NULL,
    servido_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE CASCADE,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- TABLA DE FACTURAS
CREATE TABLE facturas (
    id INT PRIMARY KEY AUTO_INCREMENT,
    restaurante_id INT NOT NULL, -- <--- NUEVO
    cliente_id INT,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total DECIMAL(10,2) NOT NULL,
    forma_pago ENUM('efectivo', 'transferencia') NOT NULL DEFAULT 'efectivo',
    estado ENUM('activa', 'anulada') DEFAULT 'activa',
    motivo_anulacion TEXT,
    fecha_anulacion DATETIME,
    usuario_anulo_nombre VARCHAR(100),
    FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE CASCADE,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

-- DETALLE DE FACTURAS
CREATE TABLE detalle_factura (
    id INT PRIMARY KEY AUTO_INCREMENT,
    restaurante_id INT NOT NULL, -- <--- NUEVO
    factura_id INT,
    producto_id INT,
    cantidad DECIMAL(10,2) NOT NULL,
    precio_unitario DECIMAL(10,2) NOT NULL,
    unidad_medida ENUM('KG', 'UND', 'LB') DEFAULT 'KG',
    subtotal DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE CASCADE,
    FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- CONTROL DE CAJA
CREATE TABLE cortes_caja (
    id INT AUTO_INCREMENT PRIMARY KEY,
    restaurante_id INT NOT NULL, -- <--- NUEVO
    fecha DATE NOT NULL,
    monto_apertura DECIMAL(10,2) NOT NULL,
    monto_cierre DECIMAL(10,2),
    estado ENUM('abierta', 'cerrada') DEFAULT 'abierta',
    usuario_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- CONFIGURACIÓN DEL NEGOCIO
CREATE TABLE configuracion_impresion (
    id INT PRIMARY KEY AUTO_INCREMENT,
    restaurante_id INT NOT NULL, -- <--- NUEVO
    nombre_negocio VARCHAR(100) NOT NULL,
    direccion TEXT,
    telefono VARCHAR(20),
    nit VARCHAR(50),
    pie_pagina TEXT,
    ancho_papel INT DEFAULT 80,
    font_size INT DEFAULT 1,
    logo_data LONGBLOB,
    logo_tipo VARCHAR(50),
    qr_data LONGBLOB,
    qr_tipo VARCHAR(50),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_config_por_restaurante (restaurante_id),
    FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id) ON DELETE CASCADE
);

-- ======================================================
-- 4. INSERCIÓN DE DATOS INICIALES DEMO
-- ======================================================

-- PRIMERO: Creamos tu primer cliente (El restaurante Demo)
INSERT INTO restaurantes (nombre_comercial) VALUES ('Marrocos POS Demo');
-- Nota: El ID generado para este será el 1.

-- Insertamos al usuario Cosmo asignado al Restaurante 1
INSERT INTO usuarios (restaurante_id, nombre, rol, pin_hash, estado) 
VALUES (1, 'Cosmo', 'admin', '0922', 1);

-- Productos iniciales asignados al Restaurante 1
-- (Incluimos tu lógica de maneja_stock directamente aquí)
INSERT INTO productos (restaurante_id, codigo, nombre, precio_unidad, categoria, maneja_stock, stock) VALUES 
(1, 'P001', 'Hamburguesa Clásica', 8.50, 'Cocina', 0, 50.00), -- Cocina: maneja_stock = 0
(1, 'P002', 'Pizza Pepperoni', 12.00, 'Cocina', 0, 30.00),   -- Cocina: maneja_stock = 0
(1, 'P003', 'Papas Fritas Grandes', 3.50, 'Cocina', 0, 100.00),-- Cocina: maneja_stock = 0
(1, 'P004', 'Refresco Natural 16oz', 1.50, 'Bar', 1, 80.00),  -- Bar: maneja_stock = 1
(1, 'P005', 'Cerveza Nacional', 2.50, 'Bar', 1, 120.00);      -- Bar: maneja_stock = 1

-- Mesas iniciales asignadas al Restaurante 1
INSERT INTO mesas (restaurante_id, numero, descripcion, estado) VALUES 
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

-- Configuración de impresión del Restaurante 1
INSERT INTO configuracion_impresion (restaurante_id, nombre_negocio, direccion, telefono, nit, pie_pagina)
VALUES (1, 'Marrocos POS Demo', 'San Salvador, El Salvador', '2222-2222', '0614-000000-000-0', '¡Gracias por su compra!');

-- ======================================================
-- 5. PERMISOS DE USUARIO MYSQL
-- ======================================================
DROP USER IF EXISTS 'cosmo'@'localhost';
CREATE USER 'cosmo'@'localhost' IDENTIFIED BY '12345678';
GRANT ALL PRIVILEGES ON restaurante_caja.* TO 'cosmo'@'localhost';
FLUSH PRIVILEGES;

-- Agregamos la columna a tu tabla de restaurantes
ALTER TABLE restaurantes ADD COLUMN codigo_negocio VARCHAR(50) UNIQUE AFTER id;

-- Le asignamos un código a tu restaurante Demo actual (que tiene el id 1)
UPDATE restaurantes SET codigo_negocio = 'MARROCOS_DEMO' WHERE id = 1;

-- ====================================================
-- Membresias
-- ====================================================

ALTER TABLE restaurantes 
ADD COLUMN estado TINYINT(1) DEFAULT 1, -- 1: Activo, 0: Suspendido
ADD COLUMN fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP, 
ADD COLUMN fecha_vencimiento DATETIME;

-- VENCER LICENCIA
-- Ponle una fecha de ayer a un restaurante específico (ejemplo ID 1)
UPDATE restaurantes 
SET fecha_vencimiento = DATE_SUB(NOW(), INTERVAL 1 DAY) 
WHERE id = 1;

-- 1. Desactivamos la revisión de llaves foráneas
SET FOREIGN_KEY_CHECKS = 0;

-- 2. Limpiamos las tablas (Esto borra TODO y resetea los contadores a 1)
TRUNCATE TABLE usuarios;
TRUNCATE TABLE restaurantes;

-- 3. Creamos la Marrocos_Demo oficial con 7 días de prueba
INSERT INTO restaurantes (id, nombre, codigo_negocio, fecha_vencimiento, estado) 
VALUES (1, 'Marrocos_Demo', 'DEMO123', DATE_ADD(NOW(), INTERVAL 7 DAY), 1);

-- 4. Creamos el usuario Administrador para esa Demo (PIN: 1234)
-- IMPORTANTE: El restaurante_id debe ser 1 para que coincida con la Demo
INSERT INTO usuarios (nombre, pin, rol, restaurante_id) 
VALUES ('AdminDemo', '1234', 'admin', 1);

-- 5. Volvemos a activar la seguridad
SET FOREIGN_KEY_CHECKS = 1;

-- 2. Creamos la Demo con exactamente 7 días de prueba
INSERT INTO restaurantes (nombre, codigo_negocio, fecha_vencimiento, estado) 
VALUES (
    'Marrocos_Demo', 
    'DEMO123', 
    DATE_ADD(NOW(), INTERVAL 7 DAY), 
    1
);