-- Migration v2: Add Mesa column to CLIENTES for per-person billing
-- Run this ONCE before deploying the new code

-- 1. Add the Mesa column
ALTER TABLE "CLIENTES" ADD COLUMN IF NOT EXISTS "Mesa" TEXT;

-- 2. Populate existing data: extract mesa number from Nombre_Cliente
-- Pattern: "Mesa 10 - Yerik" → Mesa="10", Nombre_Cliente stays as-is for now
-- Pattern: "Mesa 10" (no dash) → Mesa="10"
UPDATE "CLIENTES" 
SET "Mesa" = CASE
    WHEN "Nombre_Cliente" LIKE 'Mesa % - %' 
        THEN TRIM(SUBSTRING("Nombre_Cliente" FROM 'Mesa\s+(.+?)\s*-'))
    WHEN "Nombre_Cliente" LIKE 'Mesa %' 
        THEN TRIM(SUBSTRING("Nombre_Cliente" FROM 'Mesa\s+(.+)$'))
    ELSE NULL
END
WHERE "Mesa" IS NULL;

-- 3. Now clean up Nombre_Cliente to only contain the person's name
UPDATE "CLIENTES"
SET "Nombre_Cliente" = TRIM(SUBSTRING("Nombre_Cliente" FROM '- (.+)$'))
WHERE "Nombre_Cliente" LIKE '% - %' AND "Mesa" IS NOT NULL;

-- Done! Verify:
-- SELECT "Orden_Nu", "Mesa", "Nombre_Cliente", "Estado" FROM "CLIENTES" ORDER BY "Fecha" DESC LIMIT 20;
