# Plan Anti-Bugs: Pulido Completo de la App Web POS

Auditoría completa de las 9 páginas frontend y 10 rutas API. Se encontraron **10 bugs** organizados por prioridad.

## Proposed Changes

### 🔴 BUG 1: Navegación rota entre pestañas (Full Page Reload)

**Problema:** Las páginas `mesas`, `bebidas-frias`, `bebidas-calientes`, `entregados`, `cocina`, `admin`, e `inicio` usan `<a href="...">` en la barra inferior en lugar de `<Link>` de Next.js. Esto causa un **reload completo** de la página al navegar, perdiendo todo el estado y creando una experiencia lenta y tosca.

#### [MODIFY] Todas las páginas con bottom nav

| Página | Archivo |
|--------|---------|
| Mesas | [page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/mesas/page.tsx) |
| Cocina | [page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/cocina/page.tsx) |
| Bebidas Frías | [page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/bebidas-frias/page.tsx) |
| Bebidas Calientes | [page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/bebidas-calientes/page.tsx) |
| Entregados | [page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/entregados/page.tsx) |
| Inicio | [page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/inicio/page.tsx) |
| Admin | [page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/admin/page.tsx) |
| Nueva Comanda | [page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/nueva-comanda/page.tsx) |

**Cambio:** Reemplazar todos los `<a href="/ruta">` en las barras de navegación inferior por `<Link href="/ruta">` de `next/link`.

---

### 🔴 BUG 2: Dos endpoints distintos para marcar "LISTO" (Inconsistencia)

**Problema:** Existen dos endpoints que hacen casi lo mismo:
- `/api/kitchen/update` — Recibe `{ pedidoId, listo }` (usado por `cocina`)
- `/api/kitchen/mark-ready` — Recibe `{ itemId }` y hace toggle automático (usado por `mesas`, `bebidas-frias`, `bebidas-calientes`)

Esto genera confusión. Además, [mesas/page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/mesas/page.tsx) envía `{ itemId }` pero el `mark-ready` espera `itemId` correctamente, mientras que `cocina` usa el otro endpoint con `pedidoId`.

#### [MODIFY] [page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/cocina/page.tsx)

**Cambio:** Unificar para que `cocina` también use `/api/kitchen/mark-ready` con `{ itemId }`, eliminando la necesidad del endpoint `/api/kitchen/update`. Alternativamente, hacer que `mark-ready` sea el estándar y que `cocina` lo use.

#### [DELETE] [route.ts](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/api/kitchen/update/route.ts)

**Cambio:** Eliminar el endpoint duplicado `/api/kitchen/update` una vez que `cocina` use `mark-ready`.

---

### 🔴 BUG 3: `HoraRegistro` nunca se muestra en la vista de detalle de Mesas

**Problema:** En [mesas/page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/mesas/page.tsx) (líneas 192-214), la vista de detalle de una orden muestra cada ítem pero **no muestra la hora en que fue registrado** (`HoraRegistro`), a pesar de que el API `/api/admin/table-details` sí lo devuelve. El campo será visible en la query pero no se renderiza nunca.

#### [MODIFY] [page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/mesas/page.tsx)

**Cambio:** Agregar una columna o indicador visual con la hora de registro de cada ítem en la vista de detalle de la orden.

---

### 🟡 BUG 4: Format Rules de colores no se aplican a los ítems en `mesas`

**Problema:** Las vistas de `cocina`, `bebidas-frias` y `bebidas-calientes` usan [getTimeColor()](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/bebidas-frias/page.tsx#16-25) para colorear ítems según su antigüedad (verde→amarillo→rojo), pero la vista de detalle de [mesas/page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/mesas/page.tsx) **no aplica ningún color** a los ítems individuales basándose en su `HoraRegistro`.

#### [MODIFY] [page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/mesas/page.tsx)

**Cambio:** Aplicar la misma lógica de colores por tiempo a cada ítem en la vista de detalle (cuando están pendientes con `LISTO=false`).

---

### 🟡 BUG 5: Admin no muestra el número de Mesa en la lista de órdenes abiertas

**Problema:** En [admin/page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/admin/page.tsx) (línea 457), la tabla de mesas abiertas solo muestra `{table.cliente}` pero no `{table.mesa}`. Si el cliente fue creado con un nombre vacío y solo un número de mesa, el usuario solo ve el número de orden.

#### [MODIFY] [page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/admin/page.tsx)

**Cambio:** Mostrar "Mesa X — NombreCliente" o "Mesa X" en las tarjetas de mesas abiertas del admin, como lo hace la vista de `mesas`.

---

### 🟡 BUG 6: Admin bottom nav tiene enlace a `/` (menú cliente) en lugar de `/inicio`

**Problema:** En [admin/page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/admin/page.tsx) (línea 359), el botón "Cliente" del bottom nav apunta a `/` (la página del menú digital del cliente). Para personal interno, debería apuntar a `/inicio` (Hub del POS) y llamarse "Inicio".

#### [MODIFY] [page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/admin/page.tsx)

**Cambio:** Cambiar `href="/"` a `href="/inicio"` y label de "Cliente" a "Inicio". Hacer lo mismo en [cocina/page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/cocina/page.tsx) (línea 333-336).

---

### 🟡 BUG 7: Cocina bottom nav incompleto

**Problema:** El bottom nav de [cocina/page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/cocina/page.tsx) solo tiene 3 ítems (Monitor, Admin, Cliente). Falta consistency con las demás páginas que tienen 5 ítems (Mesas, Cocina, Inicio, Bebidas, Entregas).

#### [MODIFY] [page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/cocina/page.tsx)

**Cambio:** Unificar la barra de navegación inferior con las 5 opciones estándar.

---

### 🟢 BUG 8: Admin POS (Nueva Comanda) no envía `notas` por ítem

**Problema:** En [admin/page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/admin/page.tsx) línea 268, al armar el array `items` para enviarlo al API, solo envía `{ name, quantity }` pero no incluye ningún campo de notas individualmente por ítem.

#### [MODIFY] [page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/admin/page.tsx)

**Cambio:** Asegurar que el campo `notes` del [CartItem](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/admin/page.tsx#35-36) se incluya al enviar al API. (Menor impacto, las notas se pasan como `notas` general ya).

---

### 🟢 BUG 9: Entregados calcula 10% servicio de forma inconsistente

**Problema:** En [entregados/page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/entregados/page.tsx) línea 55, calcula `totalDiario * 0.1` como servicio. Sin embargo `totalDiario` viene del campo `Total` de la tabla CLIENTES (que ya incluye el 10% por el trigger de la BD). Esto resulta en **calcular el 10% del total que ya incluye el 10%**.

#### [MODIFY] [page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/entregados/page.tsx)

**Cambio:** Usar el `diez_porciento` que ya calcula el API `/api/admin/closed-orders` en vez de recalcularlo en el frontend.

---

### 🟢 BUG 10: Falta `dynamic = 'force-dynamic'` en algunos API routes

**Problema:** Algunas rutas como `/api/kitchen/mark-ready` y `/api/kitchen/update` no tienen `export const dynamic = 'force-dynamic'`, lo que podría causar que Next.js cachee las respuestas inesperadamente en producción.

#### [MODIFY] [route.ts](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/api/kitchen/mark-ready/route.ts)

**Cambio:** Agregar `export const dynamic = 'force-dynamic'` a todas las rutas API que mutan datos.

---

## Resumen de Archivos a Modificar

| # | Archivo | Bugs que arregla |
|---|---------|-----------------|
| 1 | [mesas/page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/mesas/page.tsx) | 1, 3, 4 |
| 2 | [cocina/page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/cocina/page.tsx) | 1, 2, 6, 7 |
| 3 | [bebidas-frias/page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/bebidas-frias/page.tsx) | 1 |
| 4 | [bebidas-calientes/page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/bebidas-calientes/page.tsx) | 1 |
| 5 | [entregados/page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/entregados/page.tsx) | 1, 9 |
| 6 | [inicio/page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/inicio/page.tsx) | 1 |
| 7 | [admin/page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/admin/page.tsx) | 1, 5, 6, 8 |
| 8 | [nueva-comanda/page.tsx](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/nueva-comanda/page.tsx) | 1 |
| 9 | [api/kitchen/mark-ready/route.ts](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/api/kitchen/mark-ready/route.ts) | 10 |
| 10 | [api/kitchen/update/route.ts](file:///home/yerik/Proyectos/restaurante-hideaway-system/demo-pos/src/app/api/kitchen/update/route.ts) | 2 (DELETE) |

## Verification Plan

### Manual Verification (Navegador)
1. Iniciar `npm run dev`, abrir `http://localhost:3000/inicio`
2. Navegar entre **todas las pestañas** del bottom nav verificando que:
   - No hay reload completo (la transición es instantánea)
   - El URL cambia correctamente
   - El ítem activo del bottom nav se resalta correctamente
3. Crear una orden de prueba desde AppSheet o desde Admin POS
4. Verificar en `/cocina` que los ítems aparecen y que el botón de "LISTO" funciona correctamente usando `mark-ready`
5. Verificar en `/mesas` → abrir una orden → confirmar que se ve la Hora de Registro y los colores de tiempo en cada ítem
6. Verificar en `/entregados` que el monto del 10% servicio es coherente con el total mostrado
7. Verificar que en `/admin` las tarjetas de mesas abiertas muestran "Mesa X"
