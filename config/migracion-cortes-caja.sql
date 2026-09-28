-- ======================================================
-- MIGRACIÓN: columnas que routes/caja.js necesita y que
-- no estaban en config/supabase-migration.sql original.
--
-- Ejecuta esto UNA VEZ en el SQL Editor de Supabase antes
-- de usar el módulo de Caja (abrir/cerrar turno, exportar).
-- Es seguro correrlo aunque alguna columna ya exista
-- (IF NOT EXISTS no falla).
-- ======================================================

ALTER TABLE cortes_caja
    ADD COLUMN IF NOT EXISTS turno INTEGER,
    ADD COLUMN IF NOT EXISTS detalles_dinero JSONB,
    ADD COLUMN IF NOT EXISTS ventas_efectivo DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS diferencia DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cerrado_at TIMESTAMP;
