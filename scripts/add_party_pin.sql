-- =====================================================
-- Script: add_party_pin.sql
-- Descripción: Agrega columna table_pin para el sistema Party PIN
-- Fecha: 18 Marzo 2026
-- =====================================================

-- Agregar columna de PIN a CLIENTES
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS "table_pin" VARCHAR(4);

-- Comentario para documentación
COMMENT ON COLUMN "CLIENTES"."table_pin" IS 'PIN de 4 dígitos para Party PIN (1000-9999)';

-- Índice para búsqueda rápida de PIN en órdenes abiertas
-- Solo indexa órdenes con Estado = 'Abierta' para optimizar búsquedas
CREATE INDEX IF NOT EXISTS idx_clientes_pin 
ON "CLIENTES"("table_pin") 
WHERE "Estado" = 'Abierta';

-- Índice compuesto para búsqueda por mesa + estado (por si se necesita)
CREATE INDEX IF NOT EXISTS idx_clientes_mesa_estado 
ON "CLIENTES"("Nombre_Cliente", "Estado") 
WHERE "Estado" = 'Abierta';
