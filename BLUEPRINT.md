# BLUEPRINT · ERP educativo

Qué construir y en qué orden. Línea base destilada de un ERP en producción (Blackwell Global University). Las convenciones transversales (stack, seguridad, protocolo de escritura) están en `CLAUDE.md`. Cada módulo termina con su criterio de "hecho": no se avanza al siguiente sin cumplirlo y sin pasar un caso real de punta a punta.

## Orden de construcción

1. **Cimientos** — repo + Vercel + Supabase con `rls_lockdown.sql`; auth de personal; `hr_employees`, roles, permisos, middleware en modo auditoría; guards; layout con sidebar y `ROUTE_TO_PAGE_KEY`. *Hecho:* un colaborador entra; un estudiante con sesión no ve nada de gestión; un superadmin aparece solo por lista.
2. Módulo 1 · Programas y categorías
3. Módulo 2 · Estudiantes
4. Módulo 3 · Matrícula
5. Módulo 4 · Estados de cuenta
6. Módulo 5 · Bots y evaluador
7. Módulo 6 · Mejora continua

---

## Personal y permisos (transversal)

- `hr_employees(id, user_id, email, full_name, role_id, is_helpdesk, …)` — **quien tiene ficha es personal**; la ficha manda sobre ser estudiante.
- `roles(id, name)` · `role_permissions(role_id, page_key, can_view, can_edit, can_delete)` (nacen en `false`).
- `app_superadmins(email)` — lista explícita. Superadmin = sin `role_id` **y** en la lista.
- `permission_audit(user_id, email, role_id, page_key, accion, metodo, ruta, bloqueado, created_at)`.
- Suplantación "ver como colaborador": cookie que el servidor resuelve a la identidad completa; solo lectura y auditada.

---

## Módulo 1 · Programas y categorías

**Qué es:** el plan de estudios es la única fuente de nombres, códigos y créditos. Notas, matrículas y precios apuntan a él por id.

**Tablas**
- `academic_programs_category(id, name, sigla ≤5, passing_score, external_id)` — la **nota mínima aprobatoria es de la categoría** y manda sobre cualquier valor guardado en una nota.
- `academic_programs(id, name, code, description, category_id, partner_campus bool, external_id)` — `partner_campus`: se dicta en un campus socio, no en tu LMS.
- `academic_courses(id, program_id, name, code, credits, hours, level, is_capstone, graduation_requirement, partner_campus, external_id)` — la malla. Crear una asignatura inyecta su fila `no_iniciada` en el registro de los ya matriculados.
- `credit_rates(id, category_id, program_id, price_per_credit, currency, effective_from, note, created_by)` con `CHECK ((category_id IS NULL) <> (program_id IS NULL))`.

**Reglas**
1. **Tarifario inmutable por versiones**: un cambio de precio es una versión nueva con `effective_from`; solo se borran versiones **que ninguna matrícula haya usado** (las futuras siempre; las vigentes/pasadas solo si no hay matrículas con `enrollment_date ≥ effective_from`), con copia en `credit_rates_deleted`. *(Ajuste 2026-08-23, carga inicial del proyecto base: versiones mal tecleadas sin matrículas.)*
2. **El programa manda sobre la categoría**: tarifa vigente del programa; si no hay, la de su categoría. Vigente = mayor `effective_from ≤ fecha`.
3. **Snapshot congelado al matricular**: `credit_rate`, `credit_rate_source`, `list_price` en la `enrollment_date`, y no se pisa nunca.

**Pantallas:** categorías; programas con su malla; tarifario con historial.

**Hecho cuando:** categoría → programa → malla → tarifa; historial visible; una matrícula de prueba recibe el snapshot correcto según su fecha.

---

## Módulo 2 · Estudiantes

**Tabla** `academic_students(id, first_name, last_name, second_last_name, document_type, document_number, email, email_alt, phone_code, phone_local, phone_number E.164, date_of_birth, city, country ISO-3, situation, situation_source, disabled, external_id, updated_by)`.
`situation ∈ activo | egresado | retiro | campus_socio` · `situation_source ∈ auto | manual`. *(2026-08-23: sin retiro temporal; una sola situación `retiro`, que aplica cuando todas las matrículas del estudiante están retiradas.)*

**Reglas**
1. **La situación se deriva** (`recomputeSituations`): retiros vigentes por matrícula, egresos por programa, campus socio. Solo `manual` la congela, con rastro.
2. **Un correo pertenece a un solo rol** (trigger). Un estudiante con sesión nunca es personal.
3. **Documento único** (409). Teléfono descompuesto (código + local) y recompuesto en E.164: el bot identifica por teléfono.
4. `disabled` excluye de búsquedas e identificación sin borrar historial.

**Pantallas:** buscador (≥2 caracteres); ficha editable con lista blanca; auditoría de cambios; enlaces directos `?id=<uuid>`.

**Hecho cuando:** crear/buscar/editar; correo duplicado en otro rol rechazado; la situación cambia sola al registrar y levantar un retiro.

---

## Módulo 3 · Matrícula

**Tablas**
- `convocatorias(id, name, product_category_id, academic_semester_id, term_year, term_block, registration_start_date, deadline_date, first_day, end_date)` — única por (categoría, año, bloque); `first_day` gobierna los vencimientos.
- `academic_student_enrollments(id, student_id, program_id, convocatoria_id, enrollment_date, status ∈ pendiente_pago | activa, activated_at, activated_by, credit_rate, credit_rate_source, list_price, external_id)`.
- `academic_course_enrollments(id, student_id, course_id, program_id, program_enrollment_id, attempt ≥1, semester_id, status ∈ no_iniciada | en_curso | aprobada | reprobada | retirada, source, opened_at/by, closed_at/by)` — **el registro curricular**, `UNIQUE (student_id, course_id, attempt)`.
- `student_withdrawals(id, student_id, enrollment_id NOT NULL, status ∈ vigente | retornado, withdrawal_date, reason, resolution_number, return_fee_amount/reference/paid_at, returned_at/by, return_note)` — índice único parcial: **un retiro vigente por matrícula**. *(2026-08-23: no hay LOA ni `type`; solo **Retiro** y **Retorno**.)*

**Flujo**
1. `POST /api/admision/matricula`: programa de la categoría de la convocatoria; crea o reutiliza estudiante; prerrequisitos (Master exige Bachelor propio terminado, Doctorado exige Master); nace `pendiente_pago`; snapshot de tarifa; **malla completa** registrada como `no_iniciada`; plan de cuotas.
2. **Activación** automática al pagar el concepto inicial (`is_initial`) o manual con `force` (auditado): registra acta, crea correo institucional (solo categorías que lo merecen), coloca en la ruta de aprendizaje.
3. **Mover de convocatoria ≠ refacturar**: reprograma fechas de cuotas sin movimientos; los importes no se tocan.

**Reglas**
- **El retiro pertenece a la matrícula**: retirado de un programa, el otro sigue activo; situación, reportes y reincorporación leen por `enrollment_id`.
- **Retorno** (2026-08-23, sustituye a LOA/Re-Entry): exige el trámite **Retorno** pagado cuando tiene importe (`RETORNO_FEE` en configuración; 0 = sin pago; cobro automático con el Módulo 4), cierra el retiro **de esa matrícula** y la reactiva. Repone las asignaturas `retirada` en el mismo intento y las `reprobada` con intento nuevo (2.º, 3.º…). No hay vencimientos ni conversiones automáticas.
- **Recursar consume créditos otra vez**: cada intento es una fila; el acta se queda con el mejor.
- El registro curricular es la verdad sobre **qué está inscrito**; las notas solo dicen cómo le fue.

**Pantallas:** convocatorias; nueva matrícula; estudiantes por convocatoria; registro curricular ("En qué está inscrito": inscribir, retirar, intentos); retiros y retornos por matrícula.

**Hecho cuando:** una matrícula nace pendiente, se activa al pagar, tiene malla y precio congelado; un retiro no toca el otro programa; un retorno con trámite pagado repone las asignaturas y la situación del estudiante vuelve a `activo` sola.

---

## Módulo 4 · Estados de cuenta

**Tablas**
- `account_concepts(kind ∈ charge | payment, type_code, abbr, name)`.
- `account_charges(external_id UNIQUE, student_id, enrollment_id, convocatoria_id, charge_type, amount, due_date, reference, source, is_initial)`.
- `account_payments(external_id UNIQUE, charge_external_id, student_id, amount, paid_date, receipt_number, series_code, transaction_reference, payment_type)` — siempre contra una cuota; `series_code='DESCUENTO'` reduce deuda pero no es ingreso.
- `scholarships(enrollment_id, percentage, granted_at/by, revoked_at/by)` — **solo el porcentaje**; el monto se deriva. Una activa por matrícula.
- `bonuses(enrollment_id, percentage | amount, reason obligatorio)`.
- `billing_templates` + `billing_template_targets` (colección > programa > categoría): cuotas, montos y cadencia desde `first_day`.

**La cascada (una sola función, `computeTuition`):**
```
lista     = tarifa congelada × créditos que lleva HOY
ahorro    = créditos convalidados × tarifa
becaBase  = max(0, lista − ahorro)
beca      = becaBase × %
afterBeca = lista − ahorro − beca
bono      = monto fijo ? min(monto, afterBeca) : afterBeca × %
total     = afterBeca − bono
```
- **Créditos que lleva** = asignaturas de la malla en su registro (matrícula viva o convalidación) + intentos extra de recursado. Se calcula; `list_price` es solo respaldo. **Cero créditos → cero tuition.**
- Versión **en bloque** (`creditosFacturablesEnBloque`) para auditor, becas y bonos: misma regla; verificar paridad con el estado de cuenta en una muestra.
- Un `ProgramAccount` por matrícula.

**Operaciones:** generar cuotas (idempotente); **refacturar** (solo cuotas sin movimientos; aborta con cobros en trámite; confirmación si cambia el total; permiso `can_edit`); **descuento** (solo superadmin); distribuir excedentes y mover pagos, nunca entre estudiantes; **auditor de tuition** (esperado vs facturado por categoría, "sin registro curricular" cuando no hay nada inscrito).

**Pantallas:** estado de cuenta (Precio oficial · Ahorro · Beca · Total; facturado/pagado/saldo/vencido; cuotas con pagos); becas; bonos; auditor; reporte de deuda.

**Hecho cuando:** una matrícula genera su plan; el pago inicial activa; una beca del 75 % da el mismo monto en Becas, estado de cuenta y auditor; refacturar no toca lo pagado.

---

## Módulo 5 · Inbound marketing: bots y evaluador

**Tablas**
- `bots(key PK, name, role ∈ soporte | ventas | retencion | inbox, prompt, twilio_number, active)` — un bot por número; se elige por el `To`. **Credenciales Twilio por bot en variables de entorno o secreto cifrado, nunca en la tabla.**
- `whatsapp_templates(key, language, content_sid, variables jsonb, bot_key, active)`.
- `whatsapp_sessions(phone, bot_key, messages jsonb ≤20, identified, user_info, pending_verify, pending_ticket)` — única por `(phone, bot_key)`.
- `bot_conversations(session_id 'wa:{bot}:{phone}', bot_key, messages, message_count, contact_email, source)` — espejo persistente; lo lee el evaluador.
- `sales_leads(bot_key, phone, name, email, program_interest, prior_studies, stage ∈ nuevo | contactable | calificado | interesado | inscrito | descartado, qualified, notes, meta)`.
- `handoff_codes(code 'ENLACE-####', customer_phone, bot_key, summary, language, topic, student_name, document_number, used, expires_at = now()+48h)`.
- RAG: `knowledge(id, bot_key, title, content, category, enabled, chunk_count)` · `knowledge_chunks(knowledge_id, content, chunk_index, embedding vector(1536))` con `ivfflat (vector_cosine_ops)` · RPC `match_knowledge(query_embedding, threshold, count, bot_key)`.

**Webhook (`POST /api/whatsapp/webhook`)**
1. Bot por número → validar `AccountSid` y **firma HMAC de Twilio** → descargar media.
2. Por `role`:
   - **ventas**: prompt + conocimiento → respuesta; extrae y guarda el lead. No identifica estudiantes.
   - **soporte**: **identificación en dos niveles** — teléfono conocido o correo identifican solos; documento desde teléfono desconocido exige segunda prueba (correo de la misma ficha). Sin identidad → onboarding con tool `identify_user`. Tools `propose_ticket` (confirmación sí/no) y `request_human` (genera `ENLACE` + `wa.me` al buzón humano).
   - **retención**: identifica **solo con coincidencia única** de teléfono; propone compromisos; resultado codificado en `[[R: …]]` que nunca se muestra.
   - **inbox** (humano): **puerta dura** — sin `ENLACE` válido y no usado, no abre; procesa encuesta 1/2/3 al cierre.
3. Conocimiento **híbrido**: vectorial (umbral 0,20) ∥ palabras clave (`ilike`, ≤6 palabras ≥4 letras); keyword primero; nunca lanza.
4. Comando literal de reinicio borra la sesión de ese teléfono. Historial ≤20; cada turno se espeja en `bot_conversations`.

**Evaluador (supervisor)** — cron diario por bot: conversaciones de **ayer** + inventario de conocimiento + prompt vigente; prompt de análisis por rol (ventas, soporte, retención con estadísticas reales de compromisos, inbox evaluando a los agentes). Escribe `supervisor_reports(report_date, bot_key, conversations_analyzed, total_messages, status, executive_summary, strengths, weaknesses, recommendations, knowledge_gaps, prompt_suggestions, full_report, quality_score)` único por (fecha, bot), y genera sugerencias (≤4/día) para el módulo 6.

**Helpdesk multicanal:** `wa_conversations(channel ∈ whatsapp | email | ticket, case_number, first_customer_at, first_response_at, rating, closed_reason, assigned_to, …)`, `wa_messages`, `wa_attachments`, `agent_skills(languages, topics, categories, is_supervisor, online, last_assigned_at)`. Clasificación por IA (idioma + temas); asignación en cascada (saludo dirigido → categoría del programa → idioma+tema → supervisora en línea), round-robin. Gmail entra vía N8N.

**Trampas Twilio/Meta:** plantillas y variables se aprueban por número; una cuenta por número; fuera de la ventana de 24 h solo sale plantilla.

**Hecho cuando:** un número de prueba conversa con ventas y deja un lead; un estudiante se identifica por teléfono y recibe un `ENLACE` al pedir humano; el cron genera reporte con `quality_score` y sugerencias.

---

## Módulo 6 · Mejora continua: revisión y aprobación

**Qué es:** el bot no se edita de memoria. El supervisor propone; una persona revisa, corrige y aprueba; solo entonces se aplica, con rastro.

**Tablas**
- `supervisor_suggestions(id, bot_key, report_date, type ∈ prompt | knowledge, title, recommendation, content, kb_topic, kb_question, kb_tags, status ∈ pending | approved | rejected, applied_at, applied_ref, reviewed_by, campaign_key, created_at)` con `UNIQUE (bot_key, type, title)`.
- `bot_prompt_versions(bot_key, version, prompt, created_by, reason, suggestion_id, created_at)` — **versionado obligatorio**; `bots.prompt` es la vigente. Prompt base y mejoras aprobadas en bloques separados, para regenerar el base sin perderlas.

**Flujo**
1. **Generación** (cron): ≤4/día por bot, `ignoreDuplicates`; no para el buzón humano; en retención `campaign_key` obligatorio.
2. **Bandeja** (`GET ?bot=&status=pending`) con conteo por bot.
3. **Edición** (`PUT`): solo en `pending`; título y contenido no vacíos.
4. **Decisión** (`PATCH {id, action}`): rechazar → `rejected` + `reviewed_by`; aprobar → **primero aplica, luego marca** `approved` + `applied_at` + `applied_ref`; si falla, sigue pendiente.
5. **Aplicación**: `prompt` → viñeta bajo `═══ MEJORAS APROBADAS ═══` (prefijo `[SOLO EN CAMPAÑA X]`) + nueva versión; `knowledge` → artículo (`title = kb_question || title`, `category = kb_topic`) e **indexa embeddings**; si existe, reindexa.
6. **Quién aprueba:** `page_key` propio (`bot_suggestions`) con `can_edit`.

**Además:** CRUD de conocimiento por bot con importación en lote y reindexado; todas las rutas de depuración con `guardStaff`.

**Hecho cuando:** una sugerencia aparece, se edita, se aprueba y se refleja en la siguiente conversación; una rechazada no vuelve; cada versión del prompt es recuperable.
