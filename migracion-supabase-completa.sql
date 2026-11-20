-- ============================================================
-- RestaurantePOS - esquema completo para proyecto Supabase NUEVO
-- Generado localmente. Ejecutar UNA vez en el SQL Editor.
-- Orden: base + reconciliacion + hardening + migraciones.
-- ============================================================


-- ============================================================
-- FILE: config/supabase-migration.sql
-- ============================================================

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

-- Usuario Admin Demo (PIN: 123456)
-- Hash generado con bcryptjs (ver scripts/seed-demo.js)
INSERT INTO usuarios (restaurante_id, nombre, rol, pin_hash, estado)
VALUES (1, 'Admin', 'admin', '$2b$10$8XqfCBNTxrvHESsilI.h7uNAJt9MJp24kb/CwGrs9xX3bsuqhrhQ2', 1);

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


-- ============================================================
-- FILE: supabase/migrations/20260928214312_reconcile_restaurant_pos_live.sql
-- ============================================================

-- RestaurantePOS: incremental reconciliation against Marroco'sPOS (PostgreSQL 17.6.1).
-- PRECONDITION: take a backup and rerun the queries in docs/PHASE_03_SCHEMA_DRIFT.md.
-- This migration is intentionally NOT applied by the recovery process.
begin;

-- Transitional constraint is required because the legacy check rejects canonical values.
alter table public.usuarios drop constraint if exists usuarios_rol_check;
alter table public.usuarios add constraint usuarios_rol_transition_check
  check (rol in ('admin','gerente','cajero','mesero','cocinero','bartender','cocina','bar'));
update public.usuarios set rol='cocina' where rol='cocinero';
update public.usuarios set rol='bar' where rol='bartender';
alter table public.usuarios drop constraint usuarios_rol_transition_check;
alter table public.usuarios add constraint usuarios_rol_check
  check (rol in ('admin','gerente','cajero','mesero','cocina','bar'));

create table public.app_sessions (
  sid text primary key,
  sess jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_app_sessions_expires_at on public.app_sessions(expires_at);
alter table public.app_sessions enable row level security;
revoke all on table public.app_sessions from public, anon, authenticated;
grant select,insert,update,delete on table public.app_sessions to service_role;

alter table public.facturas add column pedido_id bigint null;
alter table public.facturas add constraint facturas_pedido_id_fkey
  foreign key (pedido_id) references public.pedidos(id) on delete restrict;
create unique index uq_facturas_restaurante_pedido
  on public.facturas(restaurante_id,pedido_id) where pedido_id is not null;

-- Replace only a single-column UNIQUE constraint on id_externo; preserve any composite constraint.
do $$
declare v_name text;
begin
  if exists(select 1 from public.mesas where id_externo is not null) then
    raise exception 'Preflight failed: mesas.id_externo acquired live values; re-audit before applying';
  end if;
  select c.conname into v_name
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_class t on t.oid=c.conrelid
  join pg_catalog.pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public' and t.relname='mesas' and c.contype='u'
    and cardinality(c.conkey)=1
    and (select a.attname from pg_catalog.pg_attribute a
         where a.attrelid=t.oid and a.attnum=c.conkey[1])='id_externo';
  if v_name is not null then
    execute format('alter table public.mesas drop constraint %I',v_name);
  end if;
end $$;
create unique index if not exists uq_mesas_restaurante_id_externo
  on public.mesas(restaurante_id,id_externo) where id_externo is not null;

create index if not exists idx_pedidos_tenant_mesa_estado on public.pedidos(restaurante_id,mesa_id,estado);
create index if not exists idx_pedido_items_tenant_pedido on public.pedido_items(restaurante_id,pedido_id);
create index if not exists idx_pedido_items_tenant_producto on public.pedido_items(restaurante_id,producto_id);
create index if not exists idx_pedido_items_kds on public.pedido_items(restaurante_id,estado,enviado_at);
create index if not exists idx_facturas_tenant_cliente on public.facturas(restaurante_id,cliente_id);
create index if not exists idx_detalle_factura_factura on public.detalle_factura(factura_id);
create index if not exists idx_detalle_factura_producto on public.detalle_factura(producto_id);
create index if not exists idx_mesas_tenant_area on public.mesas(restaurante_id,area_id);

create or replace function public.pos_open_order(p_restaurante_id bigint,p_mesa_id bigint,p_cliente_nombre text,p_notas text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.pedidos%rowtype; m public.mesas%rowtype;
begin
  select * into m from public.mesas where id=$2 and restaurante_id=$1 for update;
  if not found then raise exception 'Mesa no encontrada'; end if;
  if m.estado<>'libre' or coalesce(m.bloqueada,false) or coalesce(m.reservada,false) then raise exception 'Mesa no disponible'; end if;
  select * into r from public.pedidos where restaurante_id=$1 and mesa_id=$2 and estado not in ('cerrado','cancelado') limit 1;
  if found then return to_jsonb(r)||jsonb_build_object('existing',true); end if;
  insert into public.pedidos(restaurante_id,mesa_id,estado,total,notas)
    values($1,$2,'abierto',0,nullif(trim(coalesce($4,'')),'')) returning * into r;
  update public.mesas set estado='ocupada',descripcion=left(coalesce(nullif(trim($3),''),'Cliente General'),100),updated_at=now()
    where id=$2 and restaurante_id=$1;
  return to_jsonb(r)||jsonb_build_object('existing',false);
end $$;

create or replace function public.pos_move_order(p_restaurante_id bigint,p_pedido_id bigint,p_mesa_origen_id bigint,p_mesa_destino_id bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p public.pedidos%rowtype; d public.mesas%rowtype;
begin
  if $3=$4 then raise exception 'Mesa destino invalida'; end if;
  select * into p from public.pedidos where id=$2 and restaurante_id=$1 for update;
  if not found or p.estado in ('cerrado','cancelado') or p.mesa_id<>$3 then raise exception 'Pedido no movible'; end if;
  perform id from public.mesas where restaurante_id=$1 and id in ($3,$4) order by id for update;
  select * into d from public.mesas where id=$4 and restaurante_id=$1;
  if not found or d.estado<>'libre' or coalesce(d.bloqueada,false) or coalesce(d.reservada,false) then raise exception 'Mesa destino no disponible'; end if;
  update public.pedidos set mesa_id=$4,updated_at=now() where id=$2 and restaurante_id=$1;
  update public.mesas set estado='ocupada',updated_at=now() where id=$4 and restaurante_id=$1;
  update public.mesas set estado='libre',descripcion=null,updated_at=now() where id=$3 and restaurante_id=$1;
  return jsonb_build_object('pedido_id',$2,'mesa_destino_id',$4,'mesa_destino',d.numero);
end $$;

create or replace function public.pos_add_order_item(p_restaurante_id bigint,p_pedido_id bigint,p_producto_id bigint,p_cantidad numeric,p_nota text,p_unidad text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p public.pedidos%rowtype; pr public.productos%rowtype; i public.pedido_items%rowtype;
begin
  if $4 is null or $4<=0 then raise exception 'Cantidad invalida'; end if;
  if upper(coalesce(nullif(trim($6),''),'UND'))<>'UND' then raise exception 'Unidad no soportada en comandas'; end if;
  select * into p from public.pedidos where id=$2 and restaurante_id=$1 for update;
  if not found or p.estado in ('cerrado','cancelado') then raise exception 'Pedido no disponible'; end if;
  select * into pr from public.productos where id=$3 and restaurante_id=$1 for update;
  if not found then raise exception 'Producto no encontrado'; end if;
  if pr.maneja_stock and coalesce(pr.stock,0)<$4 then raise exception 'Stock insuficiente'; end if;
  if pr.maneja_stock then update public.productos set stock=stock-$4,updated_at=now() where id=$3 and restaurante_id=$1; end if;
  insert into public.pedido_items(restaurante_id,pedido_id,producto_id,cantidad,unidad_medida,precio_unitario,subtotal,estado,nota)
    values($1,$2,$3,$4,'UND',coalesce(pr.precio_unidad,0),$4*coalesce(pr.precio_unidad,0),'pendiente',nullif(trim(coalesce($5,'')),'')) returning * into i;
  update public.pedidos set total=(select coalesce(sum(subtotal),0) from public.pedido_items where pedido_id=$2 and restaurante_id=$1 and estado<>'cancelado'),updated_at=now() where id=$2 and restaurante_id=$1;
  return to_jsonb(i);
end $$;

create or replace function public.pos_invoice_order(p_restaurante_id bigint,p_pedido_id bigint,p_forma_pago text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p public.pedidos%rowtype; f public.facturas%rowtype; cid bigint; amount numeric(12,2);
begin
  if $3 not in ('efectivo','transferencia') then raise exception 'Forma de pago invalida'; end if;
  select * into p from public.pedidos where id=$2 and restaurante_id=$1 for update;
  if not found or p.estado='cancelado' then raise exception 'Pedido no disponible'; end if;
  select * into f from public.facturas where restaurante_id=$1 and pedido_id=$2 limit 1;
  if found then return jsonb_build_object('factura_id',f.id,'total',f.total,'already_invoiced',true); end if;
  if p.estado='cerrado' then raise exception 'Pedido cerrado sin factura vinculada; requiere conciliacion manual'; end if;
  select coalesce(sum(subtotal),0) into amount from public.pedido_items where restaurante_id=$1 and pedido_id=$2 and estado<>'cancelado';
  if amount<=0 then raise exception 'No hay productos para cobrar'; end if;
  select id into cid from public.clientes where restaurante_id=$1 and nombre='Consumidor Final' order by id limit 1;
  if cid is null then insert into public.clientes(restaurante_id,nombre) values($1,'Consumidor Final') returning id into cid; end if;
  insert into public.facturas(restaurante_id,pedido_id,cliente_id,total,forma_pago,estado) values($1,$2,cid,amount,$3,'activa') returning * into f;
  insert into public.detalle_factura(restaurante_id,factura_id,producto_id,cantidad,precio_unitario,unidad_medida,subtotal)
    select $1,f.id,producto_id,cantidad,precio_unitario,unidad_medida,subtotal from public.pedido_items where restaurante_id=$1 and pedido_id=$2 and estado<>'cancelado';
  update public.pedidos set estado='cerrado',total=amount,updated_at=now() where id=$2 and restaurante_id=$1;
  update public.mesas set estado='libre',descripcion=null where id=p.mesa_id and restaurante_id=$1;
  return jsonb_build_object('factura_id',f.id,'cliente_id',cid,'total',amount,'already_invoiced',false);
exception when unique_violation then
  select * into f from public.facturas where restaurante_id=$1 and pedido_id=$2;
  return jsonb_build_object('factura_id',f.id,'total',f.total,'already_invoiced',true);
end $$;

create or replace function public.pos_cancel_order(p_restaurante_id bigint,p_pedido_id bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p public.pedidos%rowtype; r record;
begin
  select * into p from public.pedidos where id=$2 and restaurante_id=$1 for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if p.estado='cerrado' then raise exception 'Pedido facturado'; end if;
  if p.estado='cancelado' then return jsonb_build_object('already_cancelled',true,'pedido_id',p.id); end if;
  for r in select producto_id,cantidad from public.pedido_items where pedido_id=$2 and restaurante_id=$1 and estado<>'cancelado' for update loop
    update public.productos set stock=stock+r.cantidad,updated_at=now() where id=r.producto_id and restaurante_id=$1 and maneja_stock=true;
  end loop;
  update public.pedido_items set estado='cancelado',updated_at=now() where pedido_id=$2 and restaurante_id=$1 and estado<>'cancelado';
  update public.pedidos set estado='cancelado',total=0,updated_at=now() where id=$2 and restaurante_id=$1;
  if not exists(select 1 from public.pedidos where restaurante_id=$1 and mesa_id=p.mesa_id and id<>p.id and estado not in ('cerrado','cancelado')) then
    update public.mesas
      set estado=case when coalesce(reservada,false) then 'reservada' else 'libre' end,
          descripcion=case when coalesce(reservada,false) then nombre_reserva else null end,
          personas_actuales=0,hora_apertura=null,updated_at=now()
      where id=p.mesa_id and restaurante_id=$1;
  end if;
  return jsonb_build_object('already_cancelled',false,'pedido_id',p.id,'mesa_id',p.mesa_id);
end $$;

create or replace function public.pos_void_invoice(p_restaurante_id bigint,p_factura_id bigint,p_usuario_id bigint,p_motivo text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare f public.facturas%rowtype; r record;
begin
  perform 1 from public.usuarios where id=$3 and restaurante_id=$1 and estado=1;
  if not found then raise exception 'Usuario no autorizado para anular'; end if;
  select * into f from public.facturas where id=$2 and restaurante_id=$1 for update;
  if not found then raise exception 'Factura no encontrada'; end if;
  if f.estado='anulada' then return jsonb_build_object('already_voided',true,'factura_id',f.id); end if;
  for r in select producto_id,cantidad from public.detalle_factura where factura_id=$2 and restaurante_id=$1 loop
    update public.productos set stock=stock+r.cantidad,updated_at=now() where id=r.producto_id and restaurante_id=$1 and maneja_stock=true;
  end loop;
  update public.facturas set estado='anulada',motivo_anulacion=left(coalesce(nullif(trim($4),''),'Anulacion administrativa'),500),anulado_por=$3,fecha_anulacion=now() where id=$2 and restaurante_id=$1;
  return jsonb_build_object('already_voided',false,'factura_id',f.id);
end $$;

create or replace function public.pos_send_order(p_restaurante_id bigint,p_pedido_id bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s text; n integer;
begin
  select estado into s from public.pedidos where id=$2 and restaurante_id=$1 for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if s in ('cerrado','cancelado') then raise exception 'Pedido no disponible'; end if;
  update public.pedido_items set estado='enviado',enviado_at=now()
    where pedido_id=$2 and restaurante_id=$1 and estado='pendiente';
  get diagnostics n=row_count;
  if n>0 then update public.pedidos set estado='en_cocina',updated_at=now() where id=$2 and restaurante_id=$1; end if;
  return jsonb_build_object('enviados',n);
end $$;

create or replace function public.pos_transition_kds(p_restaurante_id bigint,p_item_id bigint,p_station text,p_next_state text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare old_state text; category text;
begin
  if $3 not in ('cocina','bar') then raise exception 'Estacion invalida'; end if;
  select i.estado,lower(p.categoria) into old_state,category
    from public.pedido_items i join public.productos p on p.id=i.producto_id and p.restaurante_id=i.restaurante_id
    where i.id=$2 and i.restaurante_id=$1 for update of i;
  if not found or category<>$3 then raise exception 'Item KDS no encontrado'; end if;
  if not ((old_state='enviado' and $4='preparando') or (old_state='preparando' and $4='listo') or (old_state='listo' and $4='servido')) then
    raise exception 'Transicion KDS invalida: % -> %',old_state,$4;
  end if;
  update public.pedido_items set estado=$4,
    preparado_at=case when $4='preparando' then now() else preparado_at end,
    listo_at=case when $4='listo' then now() else listo_at end,
    servido_at=case when $4='servido' then now() else servido_at end
    where id=$2 and restaurante_id=$1;
  return jsonb_build_object('id',$2,'estado',$4);
end $$;

-- Operational tables have no direct browser consumers in public/ or views/.
revoke select,insert,update,delete,truncate,references,trigger on table
  public.restaurantes,public.usuarios,public.productos,public.clientes,public.mesas,
  public.pedidos,public.pedido_items,public.facturas,public.detalle_factura,
  public.cortes_caja,public.areas_restaurante,public.croquis_areas,public.desperdicios,
  public.pedido_items_temporales,public.configuracion_impresion
from anon,authenticated;

alter view public.v_desperdicios_por_producto set (security_invoker=true);
alter view public.v_desperdicios_por_motivo set (security_invoker=true);

-- Legacy trigger helpers retained for compatibility but pinned to a safe lookup path.
alter function public.fn_set_updated_at() set search_path='';
alter function public.fn_sync_stock_temporales() set search_path=public;
-- Obsolete candidate: retained until live dependencies are audited.
alter function public.descontar_stock_desde_temp(integer) set search_path=public;

revoke execute on function public.pos_open_order(bigint,bigint,text,text) from public,anon,authenticated;
revoke execute on function public.pos_move_order(bigint,bigint,bigint,bigint) from public,anon,authenticated;
revoke execute on function public.pos_add_order_item(bigint,bigint,bigint,numeric,text,text) from public,anon,authenticated;
revoke execute on function public.pos_invoice_order(bigint,bigint,text) from public,anon,authenticated;
revoke execute on function public.pos_cancel_order(bigint,bigint) from public,anon,authenticated;
revoke execute on function public.pos_void_invoice(bigint,bigint,bigint,text) from public,anon,authenticated;
revoke execute on function public.pos_send_order(bigint,bigint) from public,anon,authenticated;
revoke execute on function public.pos_transition_kds(bigint,bigint,text,text) from public,anon,authenticated;
grant execute on function public.pos_open_order(bigint,bigint,text,text) to service_role;
grant execute on function public.pos_move_order(bigint,bigint,bigint,bigint) to service_role;
grant execute on function public.pos_add_order_item(bigint,bigint,bigint,numeric,text,text) to service_role;
grant execute on function public.pos_invoice_order(bigint,bigint,text) to service_role;
grant execute on function public.pos_cancel_order(bigint,bigint) to service_role;
grant execute on function public.pos_void_invoice(bigint,bigint,bigint,text) to service_role;
grant execute on function public.pos_send_order(bigint,bigint) to service_role;
grant execute on function public.pos_transition_kds(bigint,bigint,text,text) to service_role;

commit;


-- ============================================================
-- FILE: config/20260928_recovery_hardening.sql
-- ============================================================

-- MarrocosPOS / BaseRestaurante2407 — Recovery hardening
-- Fecha: 2026-09-28
-- Objetivo: reconciliar el esquema con el código recuperado, restaurar KDS/croquis
-- y mover operaciones críticas a transacciones PostgreSQL.

BEGIN;

-- 1) Roles canónicos.
ALTER TABLE IF EXISTS usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
UPDATE usuarios SET rol='cocina' WHERE rol='cocinero';
UPDATE usuarios SET rol='bar' WHERE rol='bartender';
ALTER TABLE IF EXISTS usuarios
  ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('admin','gerente','cajero','mesero','cocina','bar'));

-- 1a) Sesiones persistentes de Express. Solo el backend privilegiado debe acceder.
CREATE TABLE IF NOT EXISTS app_sessions (
  sid TEXT PRIMARY KEY,
  sess JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_sessions_expires_at ON app_sessions(expires_at);
ALTER TABLE app_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_sessions FROM anon, authenticated;

-- 1b) Columnas SaaS/caja que el código actual ya utiliza.
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS plan VARCHAR(30) NOT NULL DEFAULT 'trial';
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS fecha_inicio TIMESTAMPTZ DEFAULT now();

-- Ficha de producto y catálogo de alérgenos.
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS descripcion_corta TEXT,
  ADD COLUMN IF NOT EXISTS ingredientes TEXT,
  ADD COLUMN IF NOT EXISTS tiempo_preparacion_minutos INTEGER;

ALTER TABLE productos DROP CONSTRAINT IF EXISTS productos_tiempo_preparacion_check;
ALTER TABLE productos
  ADD CONSTRAINT productos_tiempo_preparacion_check
  CHECK (tiempo_preparacion_minutos IS NULL OR tiempo_preparacion_minutos BETWEEN 1 AND 240);

CREATE TABLE IF NOT EXISTS alergenos (
  id SMALLSERIAL PRIMARY KEY,
  nombre VARCHAR(60) NOT NULL UNIQUE,
  icono VARCHAR(60) NOT NULL DEFAULT 'bi-exclamation-triangle-fill',
  activo BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO alergenos (nombre, icono) VALUES
  ('Gluten', 'bi-basket-fill'),
  ('Lactosa', 'bi-cup-straw'),
  ('Huevo', 'bi-egg-fried'),
  ('Maní', 'bi-flower1'),
  ('Frutos secos', 'bi-tree-fill'),
  ('Mariscos', 'bi-water'),
  ('Pescado', 'bi-fish-fill'),
  ('Soya', 'bi-seedling'),
  ('Sésamo', 'bi-circle-fill'),
  ('Sulfitos', 'bi-droplet-fill')
ON CONFLICT (nombre) DO NOTHING;

CREATE TABLE IF NOT EXISTS producto_alergenos (
  restaurante_id BIGINT NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  alergeno_id SMALLINT NOT NULL REFERENCES alergenos(id) ON DELETE RESTRICT,
  PRIMARY KEY (producto_id, alergeno_id)
);
CREATE INDEX IF NOT EXISTS idx_producto_alergenos_tenant_producto
  ON producto_alergenos(restaurante_id, producto_id);

ALTER TABLE alergenos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE alergenos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE alergenos TO service_role;

ALTER TABLE producto_alergenos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE producto_alergenos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE producto_alergenos TO service_role;

ALTER TABLE pedido_items
  ADD COLUMN IF NOT EXISTS tiempo_preparacion_minutos INTEGER,
  ADD COLUMN IF NOT EXISTS alergenos TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS alergia_aviso TEXT;

ALTER TABLE cortes_caja ADD COLUMN IF NOT EXISTS turno INTEGER DEFAULT 1;
ALTER TABLE cortes_caja ADD COLUMN IF NOT EXISTS detalles_dinero JSONB;
ALTER TABLE cortes_caja ADD COLUMN IF NOT EXISTS ventas_efectivo NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cortes_caja ADD COLUMN IF NOT EXISTS diferencia NUMERIC(12,2);
ALTER TABLE cortes_caja ADD COLUMN IF NOT EXISTS cerrado_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_abierta_por_restaurante
  ON cortes_caja(restaurante_id) WHERE estado='abierta';

CREATE TABLE IF NOT EXISTS desperdicios (
  id BIGSERIAL PRIMARY KEY,
  restaurante_id BIGINT NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  unidad_medida VARCHAR(10) NOT NULL DEFAULT 'UND',
  motivo VARCHAR(80) NOT NULL,
  notas TEXT,
  registrado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_desperdicios_tenant_fecha ON desperdicios(restaurante_id, created_at DESC);
ALTER TABLE desperdicios ENABLE ROW LEVEL SECURITY;

-- 2) Diseñador de áreas/croquis.
CREATE TABLE IF NOT EXISTS areas_restaurante (
  id BIGSERIAL PRIMARY KEY,
  restaurante_id BIGINT NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  pos_x NUMERIC(10,2),
  pos_y NUMERIC(10,2),
  ancho_tarjeta INTEGER,
  alto_tarjeta INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(restaurante_id, nombre)
);

CREATE TABLE IF NOT EXISTS croquis_areas (
  id TEXT PRIMARY KEY,
  restaurante_id BIGINT NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  area_id BIGINT NOT NULL REFERENCES areas_restaurante(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  tipo VARCHAR(30) NOT NULL DEFAULT 'rect-h',
  pos_x NUMERIC(10,2) NOT NULL DEFAULT 0,
  pos_y NUMERIC(10,2) NOT NULL DEFAULT 0,
  ancho NUMERIC(10,2) NOT NULL DEFAULT 200,
  alto NUMERIC(10,2) NOT NULL DEFAULT 140,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_croquis_areas_tenant_area ON croquis_areas(restaurante_id, area_id);

ALTER TABLE mesas ADD COLUMN IF NOT EXISTS id_externo TEXT;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS area_id BIGINT REFERENCES areas_restaurante(id) ON DELETE SET NULL;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS forma VARCHAR(30) DEFAULT 'rect-h';
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS capacidad INTEGER DEFAULT 4;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS pos_x NUMERIC(10,2) DEFAULT 0;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS pos_y NUMERIC(10,2) DEFAULT 0;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS ancho NUMERIC(10,2) DEFAULT 100;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS alto NUMERIC(10,2) DEFAULT 80;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS area_fig_id TEXT REFERENCES croquis_areas(id) ON DELETE SET NULL;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS reservada BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS bloqueada BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS mesero_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS personas_actuales INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS hora_apertura TIMESTAMPTZ;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS reserva_id TEXT;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS nombre_reserva TEXT;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS hora_reserva TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mesas_restaurante_id_externo
  ON mesas(restaurante_id, id_externo) WHERE id_externo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mesas_tenant_area ON mesas(restaurante_id, area_id);

-- 3) Facturación idempotente por pedido.
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS pedido_id BIGINT REFERENCES pedidos(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_factura_pedido ON facturas(restaurante_id, pedido_id) WHERE pedido_id IS NOT NULL;

-- 4) Índices de KDS.
CREATE INDEX IF NOT EXISTS idx_pedido_items_kds ON pedido_items(restaurante_id, estado, enviado_at);
CREATE INDEX IF NOT EXISTS idx_pedidos_mesa_estado ON pedidos(restaurante_id, mesa_id, estado);

-- 5) RLS defense-in-depth para tablas nuevas. El backend server-side usa service_role,
-- por lo que la autorización principal sigue siendo el middleware + filtros tenant.
ALTER TABLE areas_restaurante ENABLE ROW LEVEL SECURITY;
ALTER TABLE croquis_areas ENABLE ROW LEVEL SECURITY;

-- 5a) Abrir pedido y ocupar mesa de forma atómica.
CREATE OR REPLACE FUNCTION public.pos_open_order(
  p_restaurante_id BIGINT,
  p_mesa_id BIGINT,
  p_cliente_nombre TEXT DEFAULT NULL,
  p_notas TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_mesa mesas%ROWTYPE;
  v_pedido pedidos%ROWTYPE;
BEGIN
  SELECT * INTO v_mesa FROM mesas
   WHERE id=p_mesa_id AND restaurante_id=p_restaurante_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mesa no encontrada'; END IF;
  IF COALESCE(v_mesa.bloqueada,false) OR v_mesa.estado IN ('reservada','bloqueada') THEN
    RAISE EXCEPTION 'Mesa bloqueada o reservada';
  END IF;

  SELECT * INTO v_pedido FROM pedidos
   WHERE restaurante_id=p_restaurante_id AND mesa_id=p_mesa_id
     AND estado NOT IN ('cerrado','cancelado')
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN to_jsonb(v_pedido) || jsonb_build_object('existing',true); END IF;

  INSERT INTO pedidos(restaurante_id,mesa_id,estado,total,notas)
  VALUES(p_restaurante_id,p_mesa_id,'abierto',0,NULLIF(trim(COALESCE(p_notas,'')),''))
  RETURNING * INTO v_pedido;

  UPDATE mesas SET estado='ocupada', descripcion=LEFT(COALESCE(NULLIF(trim(p_cliente_nombre),''),'Cliente General'),100), updated_at=now()
   WHERE id=p_mesa_id AND restaurante_id=p_restaurante_id;

  RETURN to_jsonb(v_pedido) || jsonb_build_object('existing',false);
END;
$$;

-- 5b) Mover pedido entre mesas sin dejar estados intermedios.
CREATE OR REPLACE FUNCTION public.pos_move_order(
  p_restaurante_id BIGINT,
  p_pedido_id BIGINT,
  p_mesa_origen_id BIGINT,
  p_mesa_destino_id BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_pedido pedidos%ROWTYPE;
  v_destino mesas%ROWTYPE;
BEGIN
  IF p_mesa_origen_id=p_mesa_destino_id THEN RAISE EXCEPTION 'La mesa destino debe ser distinta'; END IF;

  SELECT * INTO v_pedido FROM pedidos
   WHERE id=p_pedido_id AND restaurante_id=p_restaurante_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF v_pedido.estado IN ('cerrado','cancelado') THEN RAISE EXCEPTION 'Pedido no movible'; END IF;
  IF v_pedido.mesa_id<>p_mesa_origen_id THEN RAISE EXCEPTION 'Mesa de origen inválida'; END IF;

  -- Bloquear ambas mesas en orden determinista reduce riesgo de deadlock.
  PERFORM id FROM mesas
   WHERE restaurante_id=p_restaurante_id AND id IN (p_mesa_origen_id,p_mesa_destino_id)
   ORDER BY id FOR UPDATE;

  SELECT * INTO v_destino FROM mesas
   WHERE id=p_mesa_destino_id AND restaurante_id=p_restaurante_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mesa destino no encontrada'; END IF;
  IF v_destino.estado<>'libre' OR COALESCE(v_destino.bloqueada,false) THEN RAISE EXCEPTION 'Mesa destino no disponible'; END IF;

  UPDATE pedidos SET mesa_id=p_mesa_destino_id, updated_at=now()
   WHERE id=p_pedido_id AND restaurante_id=p_restaurante_id;
  UPDATE mesas SET estado='ocupada', updated_at=now()
   WHERE id=p_mesa_destino_id AND restaurante_id=p_restaurante_id;
  UPDATE mesas SET estado='libre', descripcion=NULL, updated_at=now()
   WHERE id=p_mesa_origen_id AND restaurante_id=p_restaurante_id;

  RETURN jsonb_build_object('pedido_id',p_pedido_id,'mesa_destino_id',p_mesa_destino_id,'mesa_destino',v_destino.numero);
END;
$$;

-- 5b) Reemplaza los alérgenos de un producto de forma atómica.
CREATE OR REPLACE FUNCTION public.pos_sync_product_allergens(
  p_restaurante_id BIGINT,
  p_producto_id BIGINT,
  p_alergeno_ids BIGINT[]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM 1 FROM productos
   WHERE id=p_producto_id AND restaurante_id=p_restaurante_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;

  DELETE FROM producto_alergenos
   WHERE producto_id=p_producto_id AND restaurante_id=p_restaurante_id;

  INSERT INTO producto_alergenos(restaurante_id, producto_id, alergeno_id)
  SELECT p_restaurante_id, p_producto_id, a.id
    FROM alergenos a
   WHERE a.id::BIGINT = ANY(COALESCE(p_alergeno_ids, '{}'::BIGINT[]))
     AND a.activo
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('producto_id',p_producto_id,'alergenos',v_count);
END;
$$;

-- 6) Operación atómica: agregar item. El precio SIEMPRE sale de productos.
CREATE OR REPLACE FUNCTION public.pos_add_order_item(
  p_restaurante_id BIGINT,
  p_pedido_id BIGINT,
  p_producto_id BIGINT,
  p_cantidad NUMERIC,
  p_nota TEXT DEFAULT NULL,
  p_unidad TEXT DEFAULT 'UND',
  p_usuario_id BIGINT DEFAULT NULL,
  p_alergia_aviso TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_producto productos%ROWTYPE;
  v_pedido pedidos%ROWTYPE;
  v_item pedido_items%ROWTYPE;
  v_precio NUMERIC(10,2);
  v_alergenos TEXT[];
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Cantidad inválida';
  END IF;

  SELECT * INTO v_pedido FROM pedidos
   WHERE id=p_pedido_id AND restaurante_id=p_restaurante_id
   FOR UPDATE;
  IF NOT FOUND OR v_pedido.estado IN ('cerrado','cancelado') THEN
    RAISE EXCEPTION 'Pedido no disponible';
  END IF;

  SELECT * INTO v_producto FROM productos
   WHERE id=p_producto_id AND restaurante_id=p_restaurante_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;

  v_precio := COALESCE(v_producto.precio_unidad, 0);
  IF v_producto.maneja_stock THEN
    IF COALESCE(v_producto.stock,0) < p_cantidad THEN RAISE EXCEPTION 'Stock insuficiente'; END IF;
    UPDATE productos SET stock=stock-p_cantidad, updated_at=now()
     WHERE id=v_producto.id AND restaurante_id=p_restaurante_id;
  END IF;

  SELECT COALESCE(array_agg(a.nombre ORDER BY a.nombre), '{}'::TEXT[])
    INTO v_alergenos
    FROM producto_alergenos pa
    JOIN alergenos a ON a.id=pa.alergeno_id
   WHERE pa.producto_id=v_producto.id
     AND pa.restaurante_id=p_restaurante_id
     AND a.activo;

  INSERT INTO pedido_items(
    restaurante_id,pedido_id,producto_id,cantidad,unidad_medida,
    precio_unitario,subtotal,estado,nota,usuario_id,
    tiempo_preparacion_minutos,alergenos,alergia_aviso
  )
  VALUES(
    p_restaurante_id,p_pedido_id,p_producto_id,p_cantidad,COALESCE(NULLIF(p_unidad,''),'UND'),
    v_precio,p_cantidad*v_precio,'pendiente',NULLIF(trim(COALESCE(p_nota,'')),''),p_usuario_id,
    v_producto.tiempo_preparacion_minutos,COALESCE(v_alergenos,'{}'::TEXT[]),
    LEFT(NULLIF(trim(COALESCE(p_alergia_aviso,'')),''),200)
  )
  RETURNING * INTO v_item;

  UPDATE pedidos
     SET total=(SELECT COALESCE(SUM(subtotal),0) FROM pedido_items WHERE pedido_id=p_pedido_id AND estado<>'cancelado'),
         updated_at=now()
   WHERE id=p_pedido_id AND restaurante_id=p_restaurante_id;

  RETURN to_jsonb(v_item);
END;
$$;

-- 7) Operación atómica e idempotente: facturar pedido y liberar mesa.
CREATE OR REPLACE FUNCTION public.pos_invoice_order(
  p_restaurante_id BIGINT,
  p_pedido_id BIGINT,
  p_forma_pago TEXT DEFAULT 'efectivo'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_pedido pedidos%ROWTYPE;
  v_factura facturas%ROWTYPE;
  v_cliente_id BIGINT;
  v_total NUMERIC(12,2);
BEGIN
  IF p_forma_pago NOT IN ('efectivo','transferencia') THEN RAISE EXCEPTION 'Forma de pago inválida'; END IF;

  SELECT * INTO v_pedido FROM pedidos
   WHERE id=p_pedido_id AND restaurante_id=p_restaurante_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;

  SELECT * INTO v_factura FROM facturas
   WHERE restaurante_id=p_restaurante_id AND pedido_id=p_pedido_id
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('factura_id',v_factura.id,'cliente_id',v_factura.cliente_id,'total',v_factura.total,'already_invoiced',true);
  END IF;

  IF v_pedido.estado IN ('cancelado') THEN RAISE EXCEPTION 'Pedido cancelado'; END IF;

  SELECT COALESCE(SUM(subtotal),0) INTO v_total FROM pedido_items
   WHERE restaurante_id=p_restaurante_id AND pedido_id=p_pedido_id AND estado<>'cancelado';
  IF v_total <= 0 THEN RAISE EXCEPTION 'No hay productos para cobrar'; END IF;

  SELECT id INTO v_cliente_id FROM clientes
   WHERE restaurante_id=p_restaurante_id AND nombre='Consumidor Final'
   ORDER BY id LIMIT 1;
  IF v_cliente_id IS NULL THEN
    INSERT INTO clientes(restaurante_id,nombre) VALUES(p_restaurante_id,'Consumidor Final') RETURNING id INTO v_cliente_id;
  END IF;

  INSERT INTO facturas(restaurante_id,pedido_id,cliente_id,total,forma_pago,estado)
  VALUES(p_restaurante_id,p_pedido_id,v_cliente_id,v_total,p_forma_pago,'activa')
  RETURNING * INTO v_factura;

  INSERT INTO detalle_factura(restaurante_id,factura_id,producto_id,cantidad,precio_unitario,unidad_medida,subtotal)
  SELECT p_restaurante_id,v_factura.id,producto_id,cantidad,precio_unitario,unidad_medida,subtotal
    FROM pedido_items
   WHERE restaurante_id=p_restaurante_id AND pedido_id=p_pedido_id AND estado<>'cancelado';

  UPDATE pedidos SET estado='cerrado', total=v_total, updated_at=now()
   WHERE id=p_pedido_id AND restaurante_id=p_restaurante_id;
  UPDATE mesas SET estado='libre', descripcion=NULL
   WHERE id=v_pedido.mesa_id AND restaurante_id=p_restaurante_id;

  RETURN jsonb_build_object('factura_id',v_factura.id,'cliente_id',v_cliente_id,'total',v_total,'already_invoiced',false);
END;
$$;

-- 7a) Cancelación atómica de pedido con devolución de stock.
CREATE OR REPLACE FUNCTION public.pos_cancel_order(
  p_restaurante_id BIGINT,
  p_pedido_id BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_pedido pedidos%ROWTYPE;
  r RECORD;
BEGIN
  SELECT * INTO v_pedido FROM pedidos
   WHERE id=p_pedido_id AND restaurante_id=p_restaurante_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  IF v_pedido.estado='cerrado' THEN RAISE EXCEPTION 'Un pedido facturado no puede cancelarse'; END IF;
  IF v_pedido.estado='cancelado' THEN
    RETURN jsonb_build_object('already_cancelled',true,'pedido_id',v_pedido.id);
  END IF;

  FOR r IN
    SELECT pi.producto_id, pi.cantidad
      FROM pedido_items pi
     WHERE pi.pedido_id=p_pedido_id AND pi.restaurante_id=p_restaurante_id AND pi.estado<>'cancelado'
     FOR UPDATE
  LOOP
    UPDATE productos
       SET stock=stock+r.cantidad, updated_at=now()
     WHERE id=r.producto_id AND restaurante_id=p_restaurante_id AND maneja_stock=true;
  END LOOP;

  UPDATE pedido_items SET estado='cancelado', updated_at=now()
   WHERE pedido_id=p_pedido_id AND restaurante_id=p_restaurante_id AND estado<>'cancelado';
  UPDATE pedidos SET estado='cancelado', total=0, updated_at=now()
   WHERE id=p_pedido_id AND restaurante_id=p_restaurante_id;

  RETURN jsonb_build_object('already_cancelled',false,'pedido_id',v_pedido.id,'mesa_id',v_pedido.mesa_id);
END;
$$;

-- 7b) Anulación atómica de factura con devolución de inventario.
CREATE OR REPLACE FUNCTION public.pos_void_invoice(
  p_restaurante_id BIGINT,
  p_factura_id BIGINT,
  p_usuario_id BIGINT,
  p_motivo TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_factura facturas%ROWTYPE;
  r RECORD;
BEGIN
  SELECT * INTO v_factura FROM facturas
   WHERE id=p_factura_id AND restaurante_id=p_restaurante_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_factura.estado='anulada' THEN
    RETURN jsonb_build_object('already_voided',true,'factura_id',v_factura.id);
  END IF;

  FOR r IN
    SELECT df.producto_id, df.cantidad
      FROM detalle_factura df
     WHERE df.factura_id=p_factura_id AND df.restaurante_id=p_restaurante_id
  LOOP
    UPDATE productos
       SET stock=stock+r.cantidad, updated_at=now()
     WHERE id=r.producto_id AND restaurante_id=p_restaurante_id AND maneja_stock=true;
  END LOOP;

  UPDATE facturas SET
    estado='anulada',
    motivo_anulacion=LEFT(COALESCE(NULLIF(trim(p_motivo),''),'Anulación administrativa'),500),
    anulado_por=p_usuario_id,
    fecha_anulacion=now()
  WHERE id=p_factura_id AND restaurante_id=p_restaurante_id;

  RETURN jsonb_build_object('already_voided',false,'factura_id',v_factura.id);
END;
$$;

-- 8) KDS: no se expone pedido_items por Realtime al navegador.
-- La recuperación usa SSE autenticado en Node/Express para respetar la sesión y el tenant.


-- 9) Las RPC críticas solo deben invocarse desde el backend con service_role.
REVOKE EXECUTE ON FUNCTION public.pos_open_order(BIGINT,BIGINT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pos_move_order(BIGINT,BIGINT,BIGINT,BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pos_add_order_item(BIGINT,BIGINT,BIGINT,NUMERIC,TEXT,TEXT,BIGINT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pos_sync_product_allergens(BIGINT,BIGINT,BIGINT[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pos_invoice_order(BIGINT,BIGINT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pos_cancel_order(BIGINT,BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pos_void_invoice(BIGINT,BIGINT,BIGINT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_open_order(BIGINT,BIGINT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_move_order(BIGINT,BIGINT,BIGINT,BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_add_order_item(BIGINT,BIGINT,BIGINT,NUMERIC,TEXT,TEXT,BIGINT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_sync_product_allergens(BIGINT,BIGINT,BIGINT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_invoice_order(BIGINT,BIGINT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_cancel_order(BIGINT,BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_void_invoice(BIGINT,BIGINT,BIGINT,TEXT) TO service_role;

COMMIT;


-- ============================================================
-- FILE: supabase/migrations/20260928225500_restrict_app_sessions_service_role.sql
-- ============================================================

begin;

revoke all privileges on table public.app_sessions from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.app_sessions to service_role;

commit;


-- ============================================================
-- FILE: supabase/migrations/20260929080623_harden_cash_operations.sql
-- ============================================================

-- Phase 06A: atomic cash lifecycle, tenant business timezone and DB validation.
begin;

alter table public.restaurantes
  add column timezone text not null default 'America/El_Salvador';

alter table public.cortes_caja
  add constraint cortes_caja_monto_apertura_nonnegative
    check (monto_apertura >= 0 and monto_apertura::text not in ('NaN','Infinity','-Infinity')),
  add constraint cortes_caja_monto_cierre_nonnegative
    check (monto_cierre is null or (monto_cierre >= 0 and monto_cierre::text not in ('NaN','Infinity','-Infinity'))),
  add constraint cortes_caja_ventas_efectivo_nonnegative
    check (ventas_efectivo is null or (ventas_efectivo >= 0 and ventas_efectivo::text not in ('NaN','Infinity','-Infinity'))),
  add constraint cortes_caja_turno_check
    check (turno in ('1','2'));

create unique index uq_cortes_caja_restaurante_abierta
  on public.cortes_caja(restaurante_id)
  where estado = 'abierta';

create or replace function public.pos_open_cash(
  p_restaurante_id bigint,
  p_usuario_id bigint,
  p_turno text,
  p_monto_apertura numeric,
  p_detalles text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_timezone text;
  v_cash public.cortes_caja%rowtype;
begin
  select r.timezone into v_timezone
  from public.restaurantes r
  where r.id = p_restaurante_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'CASH_RESTAURANT_NOT_FOUND';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    raise exception using errcode = '22023', message = 'CASH_INVALID_TIMEZONE';
  end if;
  if not exists (
    select 1 from public.usuarios u
    where u.id = p_usuario_id and u.restaurante_id = p_restaurante_id and u.estado = 1
  ) then
    raise exception using errcode = '42501', message = 'CASH_USER_NOT_AUTHORIZED';
  end if;
  if p_turno is null or p_turno not in ('1','2') then
    raise exception using errcode = '22023', message = 'CASH_INVALID_SHIFT';
  end if;
  if p_monto_apertura is null or p_monto_apertura < 0
     or p_monto_apertura::text in ('NaN','Infinity','-Infinity') then
    raise exception using errcode = '22023', message = 'CASH_INVALID_AMOUNT';
  end if;
  if length(coalesce(p_detalles,'')) > 10000 then
    raise exception using errcode = '22023', message = 'CASH_DETAILS_TOO_LARGE';
  end if;

  insert into public.cortes_caja(
    restaurante_id, fecha, monto_apertura, estado, usuario_id, turno,
    ventas_efectivo, diferencia, detalles_dinero
  ) values (
    p_restaurante_id,
    (pg_catalog.now() at time zone v_timezone)::date,
    p_monto_apertura,
    'abierta',
    p_usuario_id,
    p_turno,
    0,
    0,
    nullif(p_detalles,'')
  ) returning * into v_cash;

  return jsonb_build_object(
    'id', v_cash.id,
    'fecha', v_cash.fecha,
    'estado', v_cash.estado,
    'turno', v_cash.turno,
    'monto_apertura', v_cash.monto_apertura
  );
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'CASH_ALREADY_OPEN';
end;
$$;

create or replace function public.pos_close_cash(
  p_restaurante_id bigint,
  p_caja_id bigint,
  p_usuario_id bigint,
  p_monto_cierre numeric,
  p_detalles text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_timezone text;
  v_cash public.cortes_caja%rowtype;
  v_cutoff_utc timestamp without time zone := pg_catalog.timezone('UTC', pg_catalog.clock_timestamp());
  v_closed_at timestamp with time zone := pg_catalog.clock_timestamp();
  v_sales numeric := 0;
  v_expected numeric := 0;
  v_difference numeric := 0;
begin
  select r.timezone into v_timezone
  from public.restaurantes r
  where r.id = p_restaurante_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'CASH_RESTAURANT_NOT_FOUND';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    raise exception using errcode = '22023', message = 'CASH_INVALID_TIMEZONE';
  end if;
  if not exists (
    select 1 from public.usuarios u
    where u.id = p_usuario_id and u.restaurante_id = p_restaurante_id and u.estado = 1
  ) then
    raise exception using errcode = '42501', message = 'CASH_USER_NOT_AUTHORIZED';
  end if;
  if p_caja_id is null or p_caja_id <= 0 then
    raise exception using errcode = '22023', message = 'CASH_INVALID_ID';
  end if;
  if p_monto_cierre is null or p_monto_cierre < 0
     or p_monto_cierre::text in ('NaN','Infinity','-Infinity') then
    raise exception using errcode = '22023', message = 'CASH_INVALID_AMOUNT';
  end if;
  if length(coalesce(p_detalles,'')) > 10000 then
    raise exception using errcode = '22023', message = 'CASH_DETAILS_TOO_LARGE';
  end if;

  select * into v_cash
  from public.cortes_caja c
  where c.id = p_caja_id and c.restaurante_id = p_restaurante_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'CASH_NOT_FOUND';
  end if;
  if v_cash.estado <> 'abierta' then
    raise exception using errcode = '23505', message = 'CASH_ALREADY_CLOSED';
  end if;

  select coalesce(sum(f.total),0) into v_sales
  from public.facturas f
  where f.restaurante_id = p_restaurante_id
    and f.forma_pago = 'efectivo'
    and f.estado = 'activa'
    and f.fecha >= v_cash.created_at
    and f.fecha <= v_cutoff_utc;

  v_expected := v_cash.monto_apertura + v_sales;
  v_difference := p_monto_cierre - v_expected;

  update public.cortes_caja
  set monto_cierre = p_monto_cierre,
      ventas_efectivo = v_sales,
      diferencia = v_difference,
      detalles_dinero = nullif(p_detalles,''),
      estado = 'cerrada',
      cerrado_at = v_closed_at
  where id = v_cash.id and restaurante_id = p_restaurante_id;

  return jsonb_build_object(
    'id', v_cash.id,
    'estado', 'cerrada',
    'monto_apertura', v_cash.monto_apertura,
    'ventas_efectivo', v_sales,
    'monto_esperado', v_expected,
    'monto_cierre', p_monto_cierre,
    'diferencia', v_difference,
    'cerrado_at', v_closed_at
  );
end;
$$;

revoke execute on function public.pos_open_cash(bigint,bigint,text,numeric,text)
  from public, anon, authenticated;
revoke execute on function public.pos_close_cash(bigint,bigint,bigint,numeric,text)
  from public, anon, authenticated;
grant execute on function public.pos_open_cash(bigint,bigint,text,numeric,text) to service_role;
grant execute on function public.pos_close_cash(bigint,bigint,bigint,numeric,text) to service_role;

commit;


-- ============================================================
-- FILE: supabase/migrations/20261106000000_harden_users_and_audit.sql
-- ============================================================

-- Hardening 2026-11-06: identidad de usuario única por tenant.
--
-- El login busca por (restaurante_id, nombre) y usaba maybeSingle(); si existían
-- duplicados la consulta fallaba. Este índice lo impide a nivel de base de datos.
--
-- Si la migración falla por duplicados existentes, resuélvelos primero:
--   select restaurante_id, lower(nombre), count(*)
--   from public.usuarios group by 1,2 having count(*) > 1;

begin;

do $$
begin
  if exists (
    select 1
    from public.usuarios
    group by restaurante_id, lower(nombre)
    having count(*) > 1
  ) then
    raise exception 'Hay usuarios duplicados por restaurante; resuélvelos antes de aplicar esta migración.';
  end if;
end $$;

create unique index if not exists uq_usuarios_restaurante_nombre
  on public.usuarios (restaurante_id, lower(nombre));

create index if not exists idx_desperdicios_tenant_created
  on public.desperdicios (restaurante_id, created_at desc);

commit;


-- ============================================================
-- FILE: supabase/migrations/20261108120000_fix_pos_open_order_existing.sql
-- ============================================================

-- Reabrir una mesa ocupada debe recuperar la cuenta existente, no fallar.
-- La definición anterior validaba m.estado <> 'libre' antes de buscar el pedido,
-- por lo que pos_open_order devolvía "Mesa no disponible" al reabrir Mesa 1.
create or replace function public.pos_open_order(
  p_restaurante_id bigint,
  p_mesa_id bigint,
  p_cliente_nombre text,
  p_notas text
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  r public.pedidos%rowtype;
  m public.mesas%rowtype;
begin
  select * into m
    from public.mesas
   where id = $2 and restaurante_id = $1
   for update;

  if not found then
    raise exception 'Mesa no encontrada';
  end if;

  -- Idempotencia: si ya hay una cuenta abierta, devolverla antes de validar
  -- disponibilidad. El lock de la mesa serializa aperturas concurrentes.
  select * into r
    from public.pedidos
   where restaurante_id = $1
     and mesa_id = $2
     and estado not in ('cerrado', 'cancelado')
   order by id desc
   limit 1;

  if found then
    return to_jsonb(r) || jsonb_build_object('existing', true);
  end if;

  if m.estado <> 'libre'
     or coalesce(m.bloqueada, false)
     or coalesce(m.reservada, false) then
    raise exception 'Mesa no disponible';
  end if;

  insert into public.pedidos(restaurante_id, mesa_id, estado, total, notas)
  values ($1, $2, 'abierto', 0, nullif(trim(coalesce($4, '')), ''))
  returning * into r;

  update public.mesas
     set estado = 'ocupada',
         descripcion = left(coalesce(nullif(trim($3), ''), 'Cliente General'), 100),
         updated_at = now()
   where id = $2 and restaurante_id = $1;

  return to_jsonb(r) || jsonb_build_object('existing', false);
end $$;

revoke execute on function public.pos_open_order(bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.pos_open_order(bigint, bigint, text, text) to service_role;


-- ============================================================
-- FILE: supabase/migrations/20261108130000_add_order_item_actor.sql
-- ============================================================

-- Registra qué usuario ingresó cada ítem de la comanda.
-- La columna es nullable para no romper ítems históricos; los ítems nuevos
-- siempre se crean con el usuario autenticado que los agregó.
begin;

alter table public.pedido_items
  add column if not exists usuario_id bigint references public.usuarios(id) on delete set null;

comment on column public.pedido_items.usuario_id is
  'Usuario que ingresó el ítem a la comanda';

create index if not exists idx_pedido_items_usuario
  on public.pedido_items(restaurante_id, usuario_id);

-- Nueva sobrecarga del RPC: además del ítem, recibe al usuario de la sesión.
-- Se conserva la versión de 6 argumentos para compatibilidad, pero la app usa
-- esta versión de 7 argumentos.
create or replace function public.pos_add_order_item(
  p_restaurante_id bigint,
  p_pedido_id bigint,
  p_producto_id bigint,
  p_cantidad numeric,
  p_nota text,
  p_unidad text,
  p_usuario_id bigint
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  p public.pedidos%rowtype;
  pr public.productos%rowtype;
  i public.pedido_items%rowtype;
begin
  if $4 is null or $4 <= 0 then
    raise exception 'Cantidad invalida';
  end if;

  if upper(coalesce(nullif(trim($6), ''), 'UND')) <> 'UND' then
    raise exception 'Unidad no soportada en comandas';
  end if;

  perform 1
    from public.usuarios
   where id = $7
     and restaurante_id = $1
     and estado = 1;

  if not found then
    raise exception 'Usuario no autorizado para agregar items';
  end if;

  select * into p
    from public.pedidos
   where id = $2 and restaurante_id = $1
   for update;

  if not found or p.estado in ('cerrado', 'cancelado') then
    raise exception 'Pedido no disponible';
  end if;

  select * into pr
    from public.productos
   where id = $3 and restaurante_id = $1
   for update;

  if not found then
    raise exception 'Producto no encontrado';
  end if;

  if pr.maneja_stock and coalesce(pr.stock, 0) < $4 then
    raise exception 'Stock insuficiente';
  end if;

  if pr.maneja_stock then
    update public.productos
       set stock = stock - $4,
           updated_at = now()
     where id = $3 and restaurante_id = $1;
  end if;

  insert into public.pedido_items(
    restaurante_id, pedido_id, producto_id, cantidad, unidad_medida,
    precio_unitario, subtotal, estado, nota, usuario_id
  )
  values(
    $1, $2, $3, $4, 'UND',
    coalesce(pr.precio_unidad, 0), $4 * coalesce(pr.precio_unidad, 0),
    'pendiente', nullif(trim(coalesce($5, '')), ''), $7
  )
  returning * into i;

  update public.pedidos
     set total = (
       select coalesce(sum(subtotal), 0)
         from public.pedido_items
        where pedido_id = $2
          and restaurante_id = $1
          and estado <> 'cancelado'
     ),
     updated_at = now()
   where id = $2 and restaurante_id = $1;

  return to_jsonb(i);
end $$;

revoke execute on function public.pos_add_order_item(bigint,bigint,bigint,numeric,text,text,bigint)
  from public, anon, authenticated;
grant execute on function public.pos_add_order_item(bigint,bigint,bigint,numeric,text,text,bigint)
  to service_role;

-- Refresca la caché de PostgREST para que exponga la columna y la nueva firma.
notify pgrst, 'reload schema';

commit;


-- ============================================================
-- FILE: supabase/migrations/20261110120000_fix_invoice_client_and_area_layout.sql
-- ============================================================

-- ============================================================
-- Fix de facturación + persistencia del plano de áreas
-- ============================================================
-- 1) /areas guarda posición y tamaño de las tarjetas del plano.
-- 2) pos_invoice_order usa el cliente real del pedido o el nombre
--    capturado al abrir la mesa, limpia todos los campos operativos
--    de la mesa y conserva el orden de los ítems en la factura.
-- ============================================================

begin;

-- Layout de tarjetas del plano /areas. Se dejan nullable para que la
-- vista pueda calcular la cuadrícula inicial cuando aún no hay layout.
alter table public.areas_restaurante
  add column if not exists pos_x integer,
  add column if not exists pos_y integer,
  add column if not exists ancho_tarjeta integer,
  add column if not exists alto_tarjeta integer;

comment on column public.areas_restaurante.pos_x is 'Posición X de la tarjeta en /areas';
comment on column public.areas_restaurante.pos_y is 'Posición Y de la tarjeta en /areas';
comment on column public.areas_restaurante.ancho_tarjeta is 'Ancho de la tarjeta en /areas';
comment on column public.areas_restaurante.alto_tarjeta is 'Alto de la tarjeta en /areas';

-- Facturación: cliente real, limpieza completa de mesa y detalle ordenado.
create or replace function public.pos_invoice_order(
  p_restaurante_id bigint,
  p_pedido_id bigint,
  p_forma_pago text
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  p public.pedidos%rowtype;
  f public.facturas%rowtype;
  m public.mesas%rowtype;
  cid bigint;
  amount numeric(12,2);
  v_cliente_nombre text;
begin
  if $3 not in ('efectivo','transferencia') then
    raise exception 'Forma de pago invalida';
  end if;

  select * into p
    from public.pedidos
   where id=$2 and restaurante_id=$1
   for update;
  if not found or p.estado='cancelado' then
    raise exception 'Pedido no disponible';
  end if;

  select * into f
    from public.facturas
   where restaurante_id=$1 and pedido_id=$2
   limit 1;
  if found then
    return jsonb_build_object(
      'factura_id', f.id,
      'cliente_id', f.cliente_id,
      'total', f.total,
      'already_invoiced', true
    );
  end if;

  if p.estado='cerrado' then
    raise exception 'Pedido cerrado sin factura vinculada; requiere conciliacion manual';
  end if;

  select coalesce(sum(subtotal),0) into amount
    from public.pedido_items
   where restaurante_id=$1 and pedido_id=$2 and estado<>'cancelado';
  if amount<=0 then
    raise exception 'No hay productos para cobrar';
  end if;

  select * into m
    from public.mesas
   where id=p.mesa_id and restaurante_id=$1;

  -- 1) Cliente real del pedido, si existe y pertenece al tenant.
  if p.cliente_id is not null then
    select id into cid
      from public.clientes
     where id=p.cliente_id and restaurante_id=$1;
  end if;

  -- 2) Fallback: nombre capturado al abrir la mesa (ej. Taylor).
  if cid is null and m.id is not null then
    v_cliente_nombre := nullif(trim(coalesce(m.descripcion,'')), '');
    if v_cliente_nombre is not null
       and lower(v_cliente_nombre) not in ('cliente general','consumidor final') then
      select id into cid
        from public.clientes
       where restaurante_id=$1
         and lower(trim(nombre))=lower(v_cliente_nombre)
       order by id
       limit 1;
      if cid is null then
        begin
          insert into public.clientes(restaurante_id,nombre)
          values($1,left(v_cliente_nombre,100))
          returning id into cid;
        exception when unique_violation then
          select id into cid
            from public.clientes
           where restaurante_id=$1
             and lower(trim(nombre))=lower(v_cliente_nombre)
           order by id
           limit 1;
        end;
      end if;
    end if;
  end if;

  -- 3) Fallback histórico para cuentas sin nombre.
  if cid is null then
    select id into cid
      from public.clientes
     where restaurante_id=$1 and nombre='Consumidor Final'
     order by id
     limit 1;
    if cid is null then
      begin
        insert into public.clientes(restaurante_id,nombre)
        values($1,'Consumidor Final')
        returning id into cid;
      exception when unique_violation then
        select id into cid
          from public.clientes
         where restaurante_id=$1 and nombre='Consumidor Final'
         order by id
         limit 1;
      end;
    end if;
  end if;

  insert into public.facturas(restaurante_id,pedido_id,cliente_id,total,forma_pago,estado)
  values($1,$2,cid,amount,$3,'activa')
  returning * into f;

  insert into public.detalle_factura(
    restaurante_id,factura_id,producto_id,cantidad,precio_unitario,unidad_medida,subtotal
  )
  select $1,f.id,producto_id,cantidad,precio_unitario,unidad_medida,subtotal
    from public.pedido_items
   where restaurante_id=$1 and pedido_id=$2 and estado<>'cancelado'
   order by id;

  update public.pedidos
     set estado='cerrado', total=amount, updated_at=now()
   where id=$2 and restaurante_id=$1;

  update public.mesas
     set estado='libre',
         descripcion=null,
         mesero_id=null,
         personas_actuales=0,
         hora_apertura=null,
         reservada=false,
         bloqueada=false,
         reserva_id=null,
         nombre_reserva=null,
         hora_reserva=null,
         updated_at=now()
   where id=p.mesa_id and restaurante_id=$1;

  return jsonb_build_object(
    'factura_id', f.id,
    'cliente_id', cid,
    'total', amount,
    'already_invoiced', false
  );
exception when unique_violation then
  select * into f
    from public.facturas
   where restaurante_id=$1 and pedido_id=$2;
  return jsonb_build_object(
    'factura_id', f.id,
    'cliente_id', f.cliente_id,
    'total', f.total,
    'already_invoiced', true
  );
end $$;

revoke execute on function public.pos_invoice_order(bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.pos_invoice_order(bigint,bigint,text) to service_role;

notify pgrst, 'reload schema';

commit;


-- ============================================================
-- FILE: supabase/migrations/20261110130000_add_product_info_allergens_and_prep_time.sql
-- ============================================================

-- ============================================================
-- Ficha de producto, alérgenos y tiempo de preparación
-- ============================================================
-- 1) El POS puede mostrar ingredientes, alérgenos y tiempo estimado
--    antes de agregar un platillo.
-- 2) Los alérgenos se guardan como catálogo + relación por producto.
-- 3) Cada ítem de comanda conserva una foto (snapshot) de sus alérgenos
--    y de su tiempo de preparación para que cocina no dependa de cambios
--    posteriores en el producto.
-- 4) Cocina recibe un aviso explícito de alergia del cliente y puede
--    alertar cuando faltan 2 minutos para cumplir el tiempo estimado.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) Información pública del producto
-- ------------------------------------------------------------
alter table public.productos
  add column if not exists descripcion_corta text,
  add column if not exists ingredientes text,
  add column if not exists tiempo_preparacion_minutos integer;

alter table public.productos
  drop constraint if exists productos_tiempo_preparacion_check;

alter table public.productos
  add constraint productos_tiempo_preparacion_check
  check (
    tiempo_preparacion_minutos is null
    or (tiempo_preparacion_minutos between 1 and 240)
  );

comment on column public.productos.descripcion_corta is
  'Descripción breve que ve el mesero/cliente en el POS';
comment on column public.productos.ingredientes is
  'Ingredientes declarados del platillo o bebida';
comment on column public.productos.tiempo_preparacion_minutos is
  'Tiempo aproximado de preparación en minutos';

-- ------------------------------------------------------------
-- 2) Catálogo de alérgenos
-- ------------------------------------------------------------
create table if not exists public.alergenos (
  id smallserial primary key,
  nombre varchar(60) not null unique,
  icono varchar(60) not null default 'bi-exclamation-triangle-fill',
  activo boolean not null default true
);

insert into public.alergenos (nombre, icono) values
  ('Gluten',      'bi-basket-fill'),
  ('Lactosa',     'bi-cup-straw'),
  ('Huevo',       'bi-egg-fried'),
  ('Maní',        'bi-flower1'),
  ('Frutos secos', 'bi-tree-fill'),
  ('Mariscos',    'bi-water'),
  ('Pescado',     'bi-fish-fill'),
  ('Soya',        'bi-seedling'),
  ('Sésamo',      'bi-circle-fill'),
  ('Sulfitos',    'bi-droplet-fill')
on conflict (nombre) do nothing;

alter table public.alergenos enable row level security;
revoke all on table public.alergenos from public, anon, authenticated;
grant select on table public.alergenos to service_role;
grant usage, select on sequence public.alergenos_id_seq to service_role;

create table if not exists public.producto_alergenos (
  restaurante_id bigint not null references public.restaurantes(id) on delete cascade,
  producto_id bigint not null references public.productos(id) on delete cascade,
  alergeno_id smallint not null references public.alergenos(id) on delete restrict,
  primary key (producto_id, alergeno_id)
);

create index if not exists idx_producto_alergenos_tenant_producto
  on public.producto_alergenos(restaurante_id, producto_id);

alter table public.producto_alergenos enable row level security;
revoke all on table public.producto_alergenos from public, anon, authenticated;
grant select, insert, update, delete on table public.producto_alergenos to service_role;

-- Reemplaza los alérgenos de un producto en una sola transacción.
create or replace function public.pos_sync_product_allergens(
  p_restaurante_id bigint,
  p_producto_id bigint,
  p_alergeno_ids bigint[]
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_count integer;
begin
  perform 1
    from public.productos
   where id = $2
     and restaurante_id = $1;

  if not found then
    raise exception 'Producto no encontrado';
  end if;

  delete from public.producto_alergenos
   where producto_id = $2
     and restaurante_id = $1;

  insert into public.producto_alergenos(restaurante_id, producto_id, alergeno_id)
  select $1, $2, a.id
    from public.alergenos a
   where a.id::bigint = any(coalesce($3, '{}'::bigint[]))
     and a.activo
  on conflict do nothing;

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'producto_id', $2,
    'alergenos', v_count
  );
end $$;

revoke execute on function public.pos_sync_product_allergens(bigint,bigint,bigint[])
  from public, anon, authenticated;
grant execute on function public.pos_sync_product_allergens(bigint,bigint,bigint[])
  to service_role;

-- ------------------------------------------------------------
-- 3) Snapshot de la comanda
-- ------------------------------------------------------------
alter table public.pedido_items
  add column if not exists tiempo_preparacion_minutos integer,
  add column if not exists alergenos text[] not null default '{}',
  add column if not exists alergia_aviso text;

comment on column public.pedido_items.tiempo_preparacion_minutos is
  'Tiempo estimado copiado del producto al agregar el ítem';
comment on column public.pedido_items.alergenos is
  'Alérgenos declarados del producto al agregar el ítem';
comment on column public.pedido_items.alergia_aviso is
  'Alergia específica indicada por el mesero para este ítem';

-- ------------------------------------------------------------
-- 4) Alta de ítem con snapshot de alérgenos y tiempo
-- ------------------------------------------------------------
create or replace function public.pos_add_order_item(
  p_restaurante_id bigint,
  p_pedido_id bigint,
  p_producto_id bigint,
  p_cantidad numeric,
  p_nota text,
  p_unidad text,
  p_usuario_id bigint,
  p_alergia_aviso text default null
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  p public.pedidos%rowtype;
  pr public.productos%rowtype;
  i public.pedido_items%rowtype;
  v_alergenos text[];
begin
  if $4 is null or $4 <= 0 then
    raise exception 'Cantidad invalida';
  end if;

  if upper(coalesce(nullif(trim($6), ''), 'UND')) <> 'UND' then
    raise exception 'Unidad no soportada en comandas';
  end if;

  perform 1
    from public.usuarios
   where id = $7
     and restaurante_id = $1
     and estado = 1;

  if not found then
    raise exception 'Usuario no autorizado para agregar items';
  end if;

  select * into p
    from public.pedidos
   where id = $2 and restaurante_id = $1
   for update;

  if not found or p.estado in ('cerrado', 'cancelado') then
    raise exception 'Pedido no disponible';
  end if;

  select * into pr
    from public.productos
   where id = $3 and restaurante_id = $1
   for update;

  if not found then
    raise exception 'Producto no encontrado';
  end if;

  if pr.maneja_stock and coalesce(pr.stock, 0) < $4 then
    raise exception 'Stock insuficiente';
  end if;

  if pr.maneja_stock then
    update public.productos
       set stock = stock - $4,
           updated_at = now()
     where id = $3 and restaurante_id = $1;
  end if;

  select coalesce(array_agg(a.nombre order by a.nombre), '{}'::text[])
    into v_alergenos
    from public.producto_alergenos pa
    join public.alergenos a on a.id = pa.alergeno_id
   where pa.producto_id = pr.id
     and pa.restaurante_id = $1
     and a.activo;

  insert into public.pedido_items(
    restaurante_id, pedido_id, producto_id, cantidad, unidad_medida,
    precio_unitario, subtotal, estado, nota, usuario_id,
    tiempo_preparacion_minutos, alergenos, alergia_aviso
  )
  values(
    $1, $2, $3, $4, 'UND',
    coalesce(pr.precio_unidad, 0), $4 * coalesce(pr.precio_unidad, 0),
    'pendiente', nullif(trim(coalesce($5, '')), ''), $7,
    pr.tiempo_preparacion_minutos,
    coalesce(v_alergenos, '{}'::text[]),
    left(nullif(trim(coalesce($8, '')), ''), 200)
  )
  returning * into i;

  update public.pedidos
     set total = (
       select coalesce(sum(subtotal), 0)
         from public.pedido_items
        where pedido_id = $2
          and restaurante_id = $1
          and estado <> 'cancelado'
     ),
     updated_at = now()
   where id = $2 and restaurante_id = $1;

  return to_jsonb(i);
end $$;

revoke execute on function public.pos_add_order_item(
  bigint,bigint,bigint,numeric,text,text,bigint,text
) from public, anon, authenticated;
grant execute on function public.pos_add_order_item(
  bigint,bigint,bigint,numeric,text,text,bigint,text
) to service_role;

notify pgrst, 'reload schema';

commit;


-- ============================================================
-- FILE: supabase/migrations/20261111120000_add_plan_catalog_and_entitlements.sql
-- ============================================================

-- Catálogo comercial de planes, entitlements y bitácora de cambios.
-- Aplicar en Supabase SQL Editor. Es idempotente.

begin;

-- 1) Normalizar planes existentes.
update public.restaurantes
   set plan = case
       when lower(btrim(coalesce(plan, ''))) in ('pro_plus', 'pro-plus', 'proplus') then 'gold'
       when lower(btrim(coalesce(plan, ''))) in ('trial', 'basic', 'premium', 'gold') then lower(btrim(plan))
       else 'trial'
   end
 where plan is null
    or lower(btrim(plan)) not in ('trial', 'basic', 'premium', 'gold');

alter table public.restaurantes drop constraint if exists restaurantes_plan_check;
alter table public.restaurantes
  add constraint restaurantes_plan_check
  check (plan in ('trial', 'basic', 'premium', 'gold'));

-- 2) Catálogo de planes.
create table if not exists public.planes (
    codigo varchar(30) primary key check (codigo in ('trial', 'basic', 'premium', 'gold')),
    nombre varchar(60) not null,
    descripcion text,
    precio_mensual numeric(10,2) not null default 0,
    duracion_dias integer not null default 30 check (duracion_dias between 1 and 366),
    activo boolean not null default true,
    orden integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

insert into public.planes (codigo, nombre, descripcion, precio_mensual, duracion_dias, activo, orden)
values
    ('trial',   'Trial',   'Prueba de 7 días con las funciones de Premium.', 0,  7, true, 0),
    ('basic',   'Básico',  'POS esencial para restaurantes pequeños de una sola estación.', 19, 30, true, 1),
    ('premium', 'Premium', 'Operación completa con barra, salón, inventario y reportes.', 39, 30, true, 2),
    ('gold',    'Gold',    'Límites ampliados, soporte prioritario y roadmap avanzado, incluido DTE.', 79, 30, true, 3)
on conflict (codigo) do update set
    nombre = excluded.nombre,
    descripcion = excluded.descripcion,
    precio_mensual = excluded.precio_mensual,
    duracion_dias = excluded.duracion_dias,
    activo = excluded.activo,
    orden = excluded.orden,
    updated_at = now();

-- 3) Funciones incluidas por plan.
create table if not exists public.plan_features (
    plan_codigo varchar(30) not null references public.planes(codigo) on delete cascade,
    feature_key varchar(80) not null,
    habilitado boolean not null default true,
    primary key (plan_codigo, feature_key)
);

with
basic_features as (
    select array[
        'pos.mesas',
        'pos.pedidos',
        'pos.facturar',
        'pos.cancelar',
        'menu.productos',
        'menu.ficha',
        'menu.alergenos',
        'kds.cocina',
        'kds.alergenos',
        'caja.basica',
        'facturas.internas',
        'facturas.anular',
        'ventas.historial',
        'clientes',
        'reportes.basicos',
        'usuarios',
        'configuracion.basica'
    ]::text[] as features
),
premium_features as (
    select array[
        'pos.mesas',
        'pos.pedidos',
        'pos.facturar',
        'pos.cancelar',
        'pos.mover_pedido',
        'menu.productos',
        'menu.ficha',
        'menu.alergenos',
        'menu.tiempo_preparacion',
        'kds.cocina',
        'kds.bar',
        'kds.tiempos',
        'kds.alergenos',
        'inventario.stock',
        'inventario.alertas',
        'inventario.importar',
        'inventario.desperdicios',
        'caja.basica',
        'caja.exportar',
        'facturas.internas',
        'facturas.anular',
        'facturas.marca',
        'ventas.historial',
        'ventas.exportar',
        'clientes',
        'reportes.basicos',
        'reportes.avanzados',
        'reportes.exportar',
        'areas.croquis',
        'areas.reservas',
        'usuarios',
        'configuracion.basica',
        'configuracion.marca'
    ]::text[] as features
),
gold_features as (
    select (select features from premium_features) || array[
        'multi_caja',
        'multi_sucursal',
        'dte',
        'api',
        'auditoria',
        'reportes.bi',
        'soporte.prioritario',
        'onboarding'
    ]::text[] as features
),
feature_sets as (
    select 'trial'::varchar(30) as plan_codigo, features from premium_features
    union all
    select 'basic'::varchar(30) as plan_codigo, features from basic_features
    union all
    select 'premium'::varchar(30) as plan_codigo, features from premium_features
    union all
    select 'gold'::varchar(30) as plan_codigo, features from gold_features
)
insert into public.plan_features (plan_codigo, feature_key, habilitado)
select plan_codigo, unnest(features), true
from feature_sets
on conflict (plan_codigo, feature_key) do update set habilitado = excluded.habilitado;

-- 4) Límites por plan. NULL = sin límite.
create table if not exists public.plan_limits (
    plan_codigo varchar(30) not null references public.planes(codigo) on delete cascade,
    limit_key varchar(40) not null,
    limit_value integer,
    primary key (plan_codigo, limit_key)
);

with limit_values(plan_codigo, limit_key, limit_value) as (
    values
        ('trial',   'usuarios',       15),
        ('trial',   'mesas_fisicas',  50),
        ('trial',   'areas',           5),
        ('trial',   'productos',     500),
        ('trial',   'estaciones_kds',  2),
        ('trial',   'cajas',           1),
        ('trial',   'sucursales',      1),
        ('basic',   'usuarios',        5),
        ('basic',   'mesas_fisicas',  15),
        ('basic',   'areas',           1),
        ('basic',   'productos',     100),
        ('basic',   'estaciones_kds',  1),
        ('basic',   'cajas',           1),
        ('basic',   'sucursales',      1),
        ('premium', 'usuarios',       15),
        ('premium', 'mesas_fisicas',  50),
        ('premium', 'areas',           5),
        ('premium', 'productos',     500),
        ('premium', 'estaciones_kds',  2),
        ('premium', 'cajas',           1),
        ('premium', 'sucursales',      1),
        ('gold',    'usuarios',       null::integer),
        ('gold',    'mesas_fisicas',  null::integer),
        ('gold',    'areas',          null::integer),
        ('gold',    'productos',      null::integer),
        ('gold',    'estaciones_kds', null::integer),
        ('gold',    'cajas',          null::integer),
        ('gold',    'sucursales',     null::integer)
)
insert into public.plan_limits (plan_codigo, limit_key, limit_value)
select plan_codigo, limit_key, limit_value
from limit_values
on conflict (plan_codigo, limit_key) do update set limit_value = excluded.limit_value;

-- 5) Bitácora de cambios de plan.
create table if not exists public.plan_change_log (
    id bigserial primary key,
    restaurante_id bigint not null references public.restaurantes(id) on delete cascade,
    plan_anterior varchar(30),
    plan_nuevo varchar(30) not null,
    cambiado_por varchar(120) not null default 'superadmin',
    motivo varchar(120),
    metadata jsonb not null default '{}'::jsonb,
    creado_en timestamptz not null default now()
);

create index if not exists idx_plan_change_log_restaurante
    on public.plan_change_log(restaurante_id, creado_en desc);

-- 6) Seguridad: el catálogo solo lo usa el backend con service_role.
alter table public.planes enable row level security;
alter table public.plan_features enable row level security;
alter table public.plan_limits enable row level security;
alter table public.plan_change_log enable row level security;

revoke all on table public.planes from public, anon, authenticated;
revoke all on table public.plan_features from public, anon, authenticated;
revoke all on table public.plan_limits from public, anon, authenticated;
revoke all on table public.plan_change_log from public, anon, authenticated;

grant select, insert, update, delete on table public.planes to service_role;
grant select, insert, update, delete on table public.plan_features to service_role;
grant select, insert, update, delete on table public.plan_limits to service_role;
grant select, insert, update, delete on table public.plan_change_log to service_role;
grant usage, select on sequence public.plan_change_log_id_seq to service_role;

notify pgrst, 'reload schema';

commit;


-- ============================================================
-- FILE: supabase/migrations/20261112120000_add_audit_log.sql
-- ============================================================

-- ============================================================
-- Auditoría de acciones del POS (Plan Gold)
-- ============================================================
-- Registra eventos sensibles del tenant: inicios de sesión, altas de
-- usuarios, cambios de menú, caja, pedidos, facturas y configuración.
--
-- La tabla queda aislada por restaurante_id. El backend usa la clave
-- service_role y siempre filtra por el tenant de la sesión. No se expone
-- acceso directo a anon/authenticated.
-- ============================================================

begin;

create table if not exists public.auditoria_eventos (
  id bigint generated by default as identity primary key,
  restaurante_id bigint not null references public.restaurantes(id) on delete cascade,
  usuario_id bigint references public.usuarios(id) on delete set null,
  usuario_nombre text,
  accion text not null,
  entidad text,
  entidad_id text,
  detalle jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  creado_en timestamptz not null default pg_catalog.now(),
  constraint auditoria_eventos_accion_check check (length(btrim(accion)) > 0)
);

create index if not exists idx_auditoria_eventos_tenant_fecha
  on public.auditoria_eventos (restaurante_id, creado_en desc);

create index if not exists idx_auditoria_eventos_tenant_accion
  on public.auditoria_eventos (restaurante_id, accion, creado_en desc);

create index if not exists idx_auditoria_eventos_tenant_usuario
  on public.auditoria_eventos (restaurante_id, usuario_id, creado_en desc);

create index if not exists idx_auditoria_eventos_tenant_entidad
  on public.auditoria_eventos (restaurante_id, entidad, entidad_id);

alter table public.auditoria_eventos enable row level security;
alter table public.auditoria_eventos force row level security;

revoke all on table public.auditoria_eventos from public, anon, authenticated;
revoke all on sequence public.auditoria_eventos_id_seq from public, anon, authenticated;

grant select, insert on table public.auditoria_eventos to service_role;
grant usage, select on sequence public.auditoria_eventos_id_seq to service_role;

comment on table public.auditoria_eventos is
  'Bitácora inmutable de acciones sensibles por restaurante. Visible en /auditoria para Gold.';

comment on column public.auditoria_eventos.detalle is
  'Contexto mínimo del evento. No debe contener PINs, contraseñas, tokens ni imágenes.';

commit;

