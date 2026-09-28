-- 1. PREPARACIÃ“N DE ENTORNO
DROP DATABASE IF EXISTS restaurante_caja;
CREATE DATABASE restaurante_caja;
USE restaurante_caja;

-- 2. TABLA DE USUARIOS (Indispensable para el Login)
CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    rol ENUM('admin', 'cajero', 'mesero') NOT NULL,
    pin_hash VARCHAR(255) NOT NULL,
    estado TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABLA DE PRODUCTOS (Ya con CategorÃ­a y Stock)
-- Tabla de productos modificada
CREATE TABLE productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    categoria ENUM('Cocina', 'Bar') DEFAULT 'Cocina',
    maneja_stock BOOLEAN DEFAULT 1, -- <--- NUEVA COLUMNA
    precio_kg DECIMAL(10,2) NOT NULL DEFAULT 0,
    precio_unidad DECIMAL(10,2) NOT NULL DEFAULT 0,
    precio_libra DECIMAL(10,2) NOT NULL DEFAULT 0,
    stock DECIMAL(10,2) NOT NULL DEFAULT 0, -- Cambiado el default a 0
    stock_minimo DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 4. TABLA DE CLIENTES
CREATE TABLE clientes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nombre VARCHAR(100) NOT NULL,
    direccion TEXT,
    telefono VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. TABLA DE MESAS
CREATE TABLE mesas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    numero VARCHAR(50) NOT NULL UNIQUE,
    descripcion VARCHAR(100),
    estado ENUM('libre', 'ocupada', 'reservada', 'bloqueada') DEFAULT 'libre',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 6. TABLA DE PEDIDOS (Operaciones de Meseros)
CREATE TABLE pedidos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mesa_id INT NOT NULL,
    cliente_id INT,
    estado ENUM('abierto', 'en_cocina', 'preparando', 'listo', 'servido', 'cerrado', 'cancelado') DEFAULT 'abierto',
    total DECIMAL(10,2) NOT NULL DEFAULT 0,
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (mesa_id) REFERENCES mesas(id),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

-- 7. DETALLE DE PEDIDOS
CREATE TABLE pedido_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
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
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- 8. TABLA DE FACTURAS (Ventas Finalizadas)
CREATE TABLE facturas (
    id INT PRIMARY KEY AUTO_INCREMENT,
    cliente_id INT,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total DECIMAL(10,2) NOT NULL,
    forma_pago ENUM('efectivo', 'transferencia') NOT NULL DEFAULT 'efectivo',
    estado ENUM('activa', 'anulada') DEFAULT 'activa',
    motivo_anulacion TEXT,
    fecha_anulacion DATETIME,
    usuario_anulo_nombre VARCHAR(100),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

-- 9. DETALLE DE FACTURAS
CREATE TABLE detalle_factura (
    id INT PRIMARY KEY AUTO_INCREMENT,
    factura_id INT,
    producto_id INT,
    cantidad DECIMAL(10,2) NOT NULL,
    precio_unitario DECIMAL(10,2) NOT NULL,
    unidad_medida ENUM('KG', 'UND', 'LB') DEFAULT 'KG',
    subtotal DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (factura_id) REFERENCES facturas(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- 10. CONTROL DE CAJA
CREATE TABLE cortes_caja (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha DATE NOT NULL,
    monto_apertura DECIMAL(10,2) NOT NULL,
    monto_cierre DECIMAL(10,2),
    estado ENUM('abierta', 'cerrada') DEFAULT 'abierta',
    usuario_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- 11. CONFIGURACIÓN DEL NEGOCIO
CREATE TABLE configuracion_impresion (
    id INT PRIMARY KEY AUTO_INCREMENT,
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ______________________________________________________
-- INSERCIÓN DE DATOS INICIALES
-- ______________________________________________________

-- Productos iniciales
INSERT INTO productos (codigo, nombre, precio_unidad, categoria, stock) VALUES 
('P001', 'Hamburguesa Clásica', 8.50, 'Cocina', 50.00),
('P002', 'Pizza Pepperoni', 12.00, 'Cocina', 30.00),
('P003', 'Papas Fritas Grandes', 3.50, 'Cocina', 100.00),
('P004', 'Refresco Natural 16oz', 1.50, 'Bar', 80.00),
('P005', 'Cerveza Nacional', 2.50, 'Bar', 120.00);

-- Mesas iniciales
INSERT INTO mesas (numero, descripcion, estado) VALUES 
('Mesa 1', 'Mesa salón principal', 'libre'),
('Mesa 2', 'Mesa salón principal', 'libre'),
('Mesa 3', 'Mesa salón principal', 'libre'),
('Mesa 4', 'Mesa salón principal', 'libre'),
('Mesa 5', 'Mesa salón principal', 'libre'),
('Mesa 6', 'Mesa terraza', 'libre'),
('Mesa 7', 'Mesa terraza', 'libre'),
('Mesa 8', 'Mesa terraza', 'libre'),
('Mesa 9', 'Mesa VIP', 'libre'),
('Mesa 10', 'Mesa VIP', 'libre'),
('DOMICILIO', 'PedidosYA', 'libre'),
('PARA LLEVAR', 'Para retirar', 'libre');

-- ______________________________________________________
-- PERMISOS DE USUARIO MYSQL
-- ______________________________________________________

DROP USER IF EXISTS 'cosmo'@'localhost';
CREATE USER 'cosmo'@'localhost' IDENTIFIED BY '12345678';
GRANT ALL PRIVILEGES ON restaurante_caja.* TO 'cosmo'@'localhost';
FLUSH PRIVILEGES;

USE restaurante_caja;

-- Insertamos al usuario Cosmo como Administrador
-- Nota: En un entorno real, '0922' debería estar encriptado (Bcrypt/SHA256)
INSERT INTO usuarios (nombre, rol, pin_hash, estado) 
VALUES ('Cosmo', 'admin', '0922', 1);

-- Verificamos que se haya guardado correctamente
SELECT id, nombre, rol, estado FROM usuarios WHERE nombre = 'Cosmo';

-- ______________________________________________________
-- Modificar Stock Nulo a Alimentos
-- ______________________________________________________

USE restaurante_caja;
ALTER TABLE productos 
ADD COLUMN maneja_stock BOOLEAN DEFAULT 1 AFTER categoria;

-- Actualizamos los productos de cocina para que no requieran control de stock
-- Desactivar modo seguro
SET SQL_SAFE_UPDATES = 0;

-- Ejecutar tu consulta
UPDATE productos SET maneja_stock = 0 WHERE categoria = 'Cocina';

-- Volver a activar modo seguro (opcional, por seguridad)
SET SQL_SAFE_UPDATES = 1

-- 1. Agregamos la columna nueva con valor por defecto 1 (para que lo actual maneje stock)
ALTER TABLE productos 
ADD COLUMN maneja_stock BOOLEAN DEFAULT 1 AFTER categoria;

-- 2. Ajustamos los valores por defecto de las columnas de stock (opcional, pero recomendado por tu diseño)
ALTER TABLE productos 
ALTER COLUMN stock SET DEFAULT 0,
ALTER COLUMN stock_minimo SET DEFAULT 0;

DESCRIBE productos;

UPDATE productos 
SET maneja_stock = 0 
WHERE categoria = 'Cocina' AND id > 0;

SELECT id, nombre, categoria, maneja_stock, stock 
FROM productos;

UPDATE productos SET maneja_stock = 1 WHERE id = 4;