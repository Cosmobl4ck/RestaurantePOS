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
  pos_x NUMERIC(10,2) DEFAULT 0,
  pos_y NUMERIC(10,2) DEFAULT 0,
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

-- 6) Operación atómica: agregar item. El precio SIEMPRE sale de productos.
CREATE OR REPLACE FUNCTION public.pos_add_order_item(
  p_restaurante_id BIGINT,
  p_pedido_id BIGINT,
  p_producto_id BIGINT,
  p_cantidad NUMERIC,
  p_nota TEXT DEFAULT NULL,
  p_unidad TEXT DEFAULT 'UND'
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

  INSERT INTO pedido_items(restaurante_id,pedido_id,producto_id,cantidad,unidad_medida,precio_unitario,subtotal,estado,nota)
  VALUES(p_restaurante_id,p_pedido_id,p_producto_id,p_cantidad,COALESCE(NULLIF(p_unidad,''),'UND'),v_precio,p_cantidad*v_precio,'pendiente',NULLIF(trim(COALESCE(p_nota,'')),''))
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
REVOKE EXECUTE ON FUNCTION public.pos_add_order_item(BIGINT,BIGINT,BIGINT,NUMERIC,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pos_invoice_order(BIGINT,BIGINT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pos_cancel_order(BIGINT,BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pos_void_invoice(BIGINT,BIGINT,BIGINT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_open_order(BIGINT,BIGINT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_move_order(BIGINT,BIGINT,BIGINT,BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_add_order_item(BIGINT,BIGINT,BIGINT,NUMERIC,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_invoice_order(BIGINT,BIGINT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_cancel_order(BIGINT,BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_void_invoice(BIGINT,BIGINT,BIGINT,TEXT) TO service_role;

COMMIT;
