# Madison · ERP

ERP de gestión académica. Qué construir: `BLUEPRINT.md`. Cómo: `CLAUDE.md`.

Réplica (2026-10-06) del ERP desarrollado para ITAE Business School, con historial limpio. El código y las migraciones son los mismos; **las reglas de negocio propias de aquel proyecto no se copiaron**: están parametrizadas en `src/lib/config.ts` y se definen por variable de entorno (ver `.env.example`).

## Decisiones pendientes de Madison

Los valores de abajo nacen desactivados (0 o vacío). Hasta definirlos, el sistema funciona pero sin cobrar ni prometer pagos.

| Variable | Qué fija | Valor en origen (no copiado) |
|---|---|---|
| `APP_NAME` | Nombre visible en pantallas, bots y correos | ITAE Business School |
| `APP_CURRENCY` | Moneda por defecto de tarifas y cargos (las migraciones también traen `DEFAULT 'EUR'`) | EUR |
| `RETORNO_FEE` | Tasa del trámite «Retorno» tras un retiro; con 0 el retorno no exige pago ni genera cargo | 20 € |
| `MATRICULA_FEE` | Matrícula que paga el prospecto al completar la ficha pública; con 0 la ficha termina sin paso de pago | 100 € |
| `PAYMENT_URL` / `PAYMENT_PROVIDER` | Enlace y nombre de la pasarela de pago | Flywire |
| Programas de la ficha pública | Salen de `academic_programs` (Módulo 1); antes era una lista fija de 15 másteres | lista fija |
| Región de Vercel | Sin fijar (`vercel.json`) | fra1 |

Decisión estructural heredada que **sí** sigue en el código porque cambiarla es desarrollo nuevo, no configuración: no existe el retiro temporal (LOA); solo Retiro y Retorno. Si Madison necesita LOA, se diseña como módulo aparte.

## Puesta en marcha

1. **Supabase**: proyecto nuevo (uno por institución). Ejecuta las migraciones de `supabase/` en orden en el SQL Editor y `rls_lockdown.sql` al final (ver `supabase/README.md`).
2. **Vercel**: proyecto nuevo apuntando a este repositorio; carga las variables de `.env.example`. Los crons están en `vercel.json`. La rama de producción es `main`: cada push a `main` despliega; las demás ramas generan previews.
3. **Primer acceso**: inserta tu correo en `app_superadmins` y crea tu usuario en Supabase Auth; entra por `/login`.

## Desarrollo local

1. Copia `.env.example` a `.env.local` y rellena las claves de Supabase.
2. Ejecuta las migraciones de `supabase/` en el SQL Editor (ver `supabase/README.md`).
3. `npm install` y `npm run dev` → http://localhost:3000

## Etapa 1 · Cimientos (2026-08-23)

- `src/proxy.ts` — refresca sesión; sin sesión → `/login`.
- `src/lib/identity.ts` — `resolveIdentity()`: la única función que dice quién es el usuario y qué puede hacer.
- `src/lib/api-guard.ts` — `guardStaff`, `guardSuperadmin`, `guardApi`, `guardPage`, `puedeVerPagina`, `puedeEditarPagina`.
- `src/lib/pages.ts` — catálogo de páginas: sidebar, `ROUTE_TO_PAGE_KEY` y `API_ROUTE_TO_PAGE_KEY` salen de aquí.
- Pantallas: `/staff` (personal), `/roles` (matriz de permisos), `/audit` (decisiones de permisos).
- `PERMISOS_MODO=auditoria` (defecto) registra denegaciones y deja pasar; `estricto` bloquea.

## Módulo 1 · Programas y categorías (2026-08-23)

- `supabase/002_programas.sql` — `academic_programs_category`, `academic_programs`, `academic_courses`, `credit_rates` (inmutable por trigger).
- `src/lib/rates.ts` — `tarifaVigente(programId, fecha)`: la única función que resuelve precio por crédito (programa > categoría; mayor `effective_from ≤ fecha`; `null` si no hay).
- `src/lib/programs-audit.ts` — auditor del módulo (reporta, no corrige).
- `src/lib/courses.ts` — `alCrearAsignatura()`: inyección en registro curricular; se activa en el Módulo 3.
- Pantallas: `/categories`, `/programs`, `/programs/[id]` (malla + tarifa vigente), `/rates` (historial, nueva versión, simulador por fecha).

## Módulo 2 · Estudiantes (2026-08-23)

- `supabase/004_estudiantes.sql` — `academic_students` (teléfono E.164 por trigger, documento y correo únicos), `academic_students_audit` (diff por campo), trigger **un correo = un solo rol** en ambas tablas.
- `src/lib/students.ts` — `searchStudents()`, `identificarEstudiante()` (la función de identidad para bots y matrícula), lista blanca de edición.
- `src/lib/situations.ts` — `recomputeSituations()`: motor idempotente; `manual` congela. Cron de respaldo `/api/cron/recompute-situations` (03:30, `?dry=1`).
- Pantallas: `/students` (buscador ≥2 caracteres, `?id=<uuid>` redirige a la ficha), `/students/[id]` (ficha editable, situación, historial de cambios).

## Módulo 3 · Matrícula (2026-08-23)

- `supabase/005_matricula.sql` — `convocatorias`, `academic_student_enrollments` (snapshot de tarifa congelado por trigger), `academic_course_enrollments` (registro curricular, un intento por fila), `student_withdrawals` (Retiro/Retorno; un retiro vigente por matrícula). Situación del estudiante: `activo | egresado | retiro | campus_socio`.
- `src/lib/enrollments.ts` — `crearMatricula` (snapshot con `tarifaVigente`, malla completa `no_iniciada`, prerrequisito por categoría), `activarMatricula` (force con motivo; por pago en Módulo 4), `cambiarEstadoAsignatura`, `registrarRetiro`, `registrarPagoRetorno` (`RETORNO_FEE`), `registrarRetorno` (repone retiradas; reprobadas → intento nuevo).
- Sin LOA: solo Retiro y Retorno. Sin vencimientos ni conversiones. Tasa del retorno = `RETORNO_FEE` (0 = sin pago).
- Pantallas: `/admissions` (convocatorias, nueva matrícula, estudiantes por convocatoria), `/admissions/enrollments/[id]` (snapshot, registro curricular con acciones, retiro y retorno).

## Módulo 4 · Estados de cuenta — entrega 1 (2026-08-23)

- `supabase/006_cuentas.sql` — `account_concepts` (con semilla), `account_charges`, `account_payments` (pago↔cargo mismo estudiante por trigger; anulación, no borrado), `scholarships` (una activa), `bonuses` (XOR %/monto), `billing_templates` + `billing_template_targets`.
- `src/lib/tuition.ts` — **la cascada** `computeTuition` y `computeTuitionEnBloque` (la individual delega en la de bloque: no pueden divergir). Tarifa null → total null (≠ 0); cero créditos → cero tuition.
- `src/lib/billing.ts` — `generarCuotas` (idempotente; inicial en fecha de matrícula + cuotas desde `first_day`), `refacturar` (ensayo → confirmar; solo cuotas sin movimientos), `registrarPago` (pago inicial completo → activa matrícula; RETORNO completo → marca el trámite del retiro), `crearCargoRetorno` (`RETORNO_FEE` al registrar retiro; sin importe no hay cargo).
- Pantallas: `/accounts` (plantillas de facturación), `/accounts/[id]` (estado de cuenta: cascada, cuotas con pagos, becas y bonos, refacturación con ensayo). DESCUENTO solo superadmin.
- Entrega 2: `src/lib/tuition-audit.ts` (auditor esperado-vs-facturado por matrícula y categoría; reporte de deuda que cierra por identidad), `moverPago` (nunca entre estudiantes), pantallas `/accounts/audit` y `/accounts/debt`.

## Módulo 5 · Bots y evaluador — entrega 1 (2026-08-23)

- `supabase/007_bots.sql` — extensión `vector`; `bots` (semilla: ventas, soporte, retencion, inbox), `whatsapp_templates`, `whatsapp_sessions`, `bot_conversations` (espejo para el evaluador), `sales_leads`, `handoff_codes` (ENLACE, 48 h), `knowledge` + `knowledge_chunks` (vector 1536, ivfflat) + RPC `match_knowledge`, `supervisor_reports`.
- `src/lib/embeddings.ts` — OpenAI `text-embedding-3-small` (único uso de OpenAI); sin clave, degrada a solo keyword.
- `src/lib/knowledge.ts` — troceado, indexado idempotente y búsqueda **híbrida** (keyword primero: ≤6 palabras ≥4 letras; vectorial umbral 0,20; nunca lanza).
- Pantalla `/bots`: prompt vigente y número por bot, CRUD de conocimiento con indexado, reindexar todo, probador de búsqueda.
- Pendiente: entrega 2 (webhook WhatsApp + roles + Twilio), entrega 3 (evaluador diario + leads).

## Módulo 5 — entrega 2: webhook de WhatsApp (2026-08-23)

- `src/app/api/whatsapp/webhook/route.ts` — público; autenticidad por firma HMAC de Twilio + AccountSid (`src/lib/twilio.ts`). Bot elegido por el `To`. Respuesta TwiML (parte mensajes >1500 chars). `x-dev-secret: CRON_SECRET` permite simular en desarrollo.
- `src/lib/bots/claude.ts` — Anthropic SDK, modelo `claude-opus-4-8` (BOT_MODEL para cambiar), bucle de tools manual (máx. 4 vueltas, tool_results en un solo mensaje).
- `src/lib/bots/engine.ts` — sesiones (historial ≤20) + espejo `bot_conversations`; comando literal `reiniciar`; **ventas** (conocimiento + tool save_lead), **soporte** (identificación 2 niveles: teléfono/correo solos, documento exige correo de la misma ficha; propose_ticket con sí/no; request_human → ENLACE + wa.me), **retención** (solo coincidencia única de teléfono; `[[R: …]]` oculto), **inbox** (puerta dura por ENLACE; con puerta abierta el bot calla).
- Sin `ANTHROPIC_API_KEY` los roles con IA responden un mensaje de cortesía (no se caen).

## Módulo 5 — entrega 3: evaluador, leads y conversaciones (2026-08-23)

- `supabase/008_evaluador.sql` — `supervisor_suggestions` (la alimenta el cron; la gestiona el Módulo 6).
- `src/lib/supervisor.ts` — evaluador diario por bot: conversaciones de ayer + inventario + prompt vigente; prompt de análisis por rol (retención con estadísticas reales de `[[R]]`); informe estructurado vía tool forzada; `supervisor_reports` único por (fecha, bot); ≤4 sugerencias/día (`ignoreDuplicates`), nunca para el inbox.
- Cron `/api/cron/supervisor` (04:30, `?dry=1`, `?date=`). Pantallas: `/leads` (etapas, calificado, notas), `/bots/conversations` (espejo), `/bots/reports` (nota, fortalezas/debilidades, huecos).

## Módulo 6 · Mejora continua (2026-08-23)

- `supabase/009_mejora_continua.sql` — `bot_prompt_versions` (versionado obligatorio; semilla v1 con el prompt vigente). La historia nunca se reescribe: restaurar crea versión nueva.
- `src/lib/suggestions.ts` — editar (solo pending, título/contenido no vacíos), rechazar, y **aprobar = primero aplica, luego marca**: prompt → viñeta bajo `═══ MEJORAS APROBADAS ═══` (prefijo `[SOLO EN CAMPAÑA X]`) + versión; knowledge → artículo (`title = kb_question || title`, `category = kb_topic`) indexado; si existía, reindexa. Si aplicar falla, sigue pendiente.
- Editar el prompt a mano en /bots también crea versión. Pantallas: `/suggestions` (bandeja con conteo por bot, page_key propio `bot_suggestions`), `/bots/versions` (historial + restaurar).

## Ventas saliente (outbound) — 2026-09-16

- `supabase/010_outbound.sql` — perfil en `sales_leads` (profession, age, employment, specialty_interest, language, consent, source), `body_preview` en plantillas, `campaigns` (plantilla + variables_map + audience_filter + pitch_notes + daily_limit) y `campaign_recipients` (cola; un pendiente por lead).
- `src/lib/campaigns.ts` — audiencia (solo consentidos, nunca inscrito/descartado), poblar cola, despacho idempotente con tope diario y ritmo suave; lo enviado se espeja como turno del bot; `marcarRespuestaDeCampana` marca respondido y entrega el guión.
- El bot de ventas recibe PERFIL DEL CONTACTO + guión de la campaña en cada mensaje (personalización inbound y outbound).
- Cron `/api/cron/campaign-dispatch` (cada hora 09–19 UTC, `?dry=1`). Importación `/api/leads/import` (exige `consent_confirmed`) + pegado de CSV en `/leads`. Pantalla `/campaigns` (plantillas HX…, audiencia, cola, ensayo, activar/pausar).

## Ficha de inscripción + pago Flywire (2026-09-24)

- `supabase/011_inscripciones.sql` — `enrollment_requests` (token 32-hex en URL, caduca a 14 días; estados enviada→completada→pagada→formalizada/anulada).
- `src/lib/enroll.ts` — crear/completar ficha (lista blanca + validación), declarar referencia de pago, decisión del equipo. Matrícula y pasarela por configuración (`MATRICULA_FEE`, `PAYMENT_URL`, `PAYMENT_PROVIDER`); con matrícula 0 la ficha termina sin paso de pago. Programas ofrecidos: `programasComerciales()` lee `academic_programs`. Confirmación de pago manual contra el panel de la pasarela hasta tener webhook.
- Página pública `/enroll/[token]` prellenada desde el lead; al completar → botón de pago (si hay matrícula configurada) + campo de referencia. El bot de ventas tiene la tool `send_enrollment_form` (solo cuando el prospecto decide inscribirse); al confirmar pago el lead pasa a «inscrito».
- Bandeja del equipo en `/leads/enrollments` (page_key leads): verificar pago, formalizar en Admisión, anular.
