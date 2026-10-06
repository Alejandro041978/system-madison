# CLAUDE.md · ERP educativo

Convenciones del proyecto. Son decisiones ya pagadas con errores reales en un ERP en producción; no las reinterpretes. El qué construir y en qué orden está en `BLUEPRINT.md` — léelo antes de empezar cualquier módulo.

## Stack

- **Next.js 16** (App Router, rutas en `src/app/api/**/route.ts`), React 19, TypeScript, Tailwind, `lucide-react`. Lee `node_modules/next/dist/docs/` antes de escribir código de Next: esta versión difiere de tu entrenamiento.
- **Supabase**: Postgres + Auth + Storage + extensión `vector`. **Vercel**: hosting y crons (`vercel.json`). **GitHub**: `main` despliega solo con `git push`. **Resend**: correo transaccional. **Anthropic** (`claude-opus-4-8`): bots, supervisor, clasificación. **OpenAI** (`text-embedding-3-small`): solo embeddings. **Twilio**: WhatsApp.
- Variables de entorno solo en Vercel y `.env.local`; **nunca en el chat ni en el repo**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `APP_NAME`, `APP_CURRENCY`, `RETORNO_FEE`, `MATRICULA_FEE`, `PAYMENT_URL`, `PAYMENT_PROVIDER`, `CRON_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`.

## Acceso a datos y seguridad

- Todo acceso va desde rutas de servidor con `SUPABASE_SERVICE_ROLE_KEY`. La autorización la hacen los guards y el middleware, no las políticas RLS. El navegador usa la clave anónima solo para la sesión.
- `supabase/rls_lockdown.sql` (se ejecuta una vez, se mantiene): RLS en **todas** las tablas de `public`; `REVOKE ALL … FROM anon, authenticated` (también privilegios por defecto); vistas con `security_invoker = on`.
- **Nunca políticas para `authenticated`**: los estudiantes también tienen sesión Supabase.
- **Cada tabla nueva nace con `GRANT ALL ON TABLE x TO service_role`.** Sin el grant el servidor recibe `permission denied`, no "no existe", y el error es invisible desde la pantalla.
- Guards en `src/lib/api-guard.ts`: `guardStaff()` (sesión + ficha de colaborador), `guardSuperadmin()` (lista explícita `app_superadmins`), `puedeEditarPagina(user, pageKey)`. Identidad **por presencia, nunca por ausencia**: "sin rol" no significa superadmin; un fallo de lectura **niega**.
- Permisos por página: `ROUTE_TO_PAGE_KEY` (páginas) y `API_ROUTE_TO_PAGE_KEY` (APIs) → `role_permissions(role_id, page_key, can_view, can_edit, can_delete)`. Acción por método: GET→ver, DELETE→borrar, resto→editar. Modo auditoría por defecto (registra en `permission_audit` y deja pasar); `PERMISOS_MODO=estricto` bloquea. **Sidebar y `ROUTE_TO_PAGE_KEY` siempre sincronizados.**

## Parámetros de la institución

- Nombre, moneda, tasas (retorno, matrícula) y pasarela de pago viven en `src/lib/config.ts` y se leen de variables de entorno. **Nunca se escribe un importe ni el nombre de la institución en una pantalla o librería**: se importa de ahí. Sin valor configurado, las tasas valen 0 y los flujos no exigen pago (2026-10-06, réplica Madison: las reglas del proyecto de origen no se copiaron).

## Reglas de código

- **PostgREST corta en 1.000 filas sin avisar.** Toda lectura que pueda superarlas se pagina con `.order(col).range(from, from + 999)` hasta recibir menos de 1.000; los `.in()` se parten en lotes de ~150 ids. Un cron "corrió" semanas sin mover a nadie por esto.
- **Un dato, una función.** Precio oficial, créditos, situación, identidad: cada uno se calcula en una sola función de `src/lib/` y todas las pantallas la llaman. Tres pantallas con tres precios es el error más caro que tuvimos.
- **El estado calculado manda sobre el valor.** Un acumulado parcial no es un reprobado. Los estados se escriben una vez; nadie los recalcula comparando contra el mínimo en cada pantalla.
- **Emparejar por id, nunca por nombre ni por código de origen.** Los nombres legados vienen truncados; los "códigos" son números de orden que chocan. El nombre de origen se conserva solo como trazabilidad.
- **Las situaciones y los estados se derivan, no se escriben a mano.** Motores idempotentes (`recompute*`) con cron de respaldo; una etiqueta `manual` explícita es lo único que los congela.
- **URLs siempre en inglés**; contenido en español. Cambiar una URL = mover la página + redirect con query.
- Comentarios que explican el **porqué**, con fecha y caso real.
- Una columna que falta en un `select` llega como `undefined` en silencio; un trigger de protección descarta un UPDATE sin error. Cuando algo "no hace nada", mira el select y los triggers.
- `null` ≠ `0`: distingue *no pude calcular* de *calculé y da cero*.

## Escrituras masivas (protocolo obligatorio)

1. Ensayo en seco con conteos.
2. Respaldo completo de las filas afectadas, verificado (abortar si los conteos no cuadran).
3. Aplicar.
4. Verificación pegada: releer y recontar, esperar 0.
5. Archivo `NO_CORRER_deshacer_<tema>.sql` con las filas previas completas, versionado en el repo.

Nunca se borra ni se sobreescribe sin mirar antes el destino. Lo que se apaga (un sistema legado, un respaldo) se deja descrito en un comentario con fecha.

## Auditores y reportes

- Cada módulo trae su auditor (cobertura del registro, tuition, rutas de aprendizaje, vínculos). **Un auditor reporta; no corrige.** Un auditor que no avisa de lo que bloquea un proceso no sirve.
- Los reportes cierran por identidad (`Activos = Matriculados − Titulados − Egresados − Retirados`). Si no cierra, es un dato roto, no un redondeo: se muestra en rojo.

## Crons

- `vercel.json`: un endpoint `/api/cron/<nombre>` por tarea, `Authorization: Bearer ${CRON_SECRET}`, `?dry=1` para ensayo. Toda tarea de convergencia es idempotente: volver a correrla no duplica nada.

## Cómo trabajar conmigo

- Antes de tocar datos: ensayo y números; luego la decisión es de la persona.
- Antes de una acción difícil de revertir o hacia afuera (correos, mensajes, pagos): confirmar.
- Reportar lo que pasó tal cual: si algo falló o se omitió, decirlo con el error.

## Notas de Next.js 16

@AGENTS.md
