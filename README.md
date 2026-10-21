# easystem — POS + KDS

Sistema de punto de venta y pantallas de cocina para restaurante. Next.js 16,
React 19, Supabase y CSS Modules.

## Inicio rápido

```bash
npm install
npm run dev
```

Abrir `http://localhost:3000`. La primera pantalla es `/login`; el PIN por
defecto es `0000`.

## Variables de entorno

Crear `.env.local` (no se versiona):

```env
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=TU-SERVICE-ROLE-KEY
AUTH_SECRET=UN-SECRETO-ALEATORIO
ADMIN_API_KEY=0000
```

## Comandos

```bash
npm run dev      # desarrollo
npm run lint     # ESLint
npm run build    # build de producción
npm start        # servir el build
```

## Documentación

- `../docs/ARQUITECTURA.md`
- `../docs/REGLAS_NEGOCIO.md`
- `../docs/GUIA_PRUEBAS.md`
- `../docs/PRODUCCION.md`
- `../supabase/README.md`
