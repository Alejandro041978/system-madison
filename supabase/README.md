# supabase/

Migraciones en orden numérico. Se ejecutan a mano en el **SQL Editor** del panel de Supabase (no hay Supabase CLI en esta máquina).

| Orden | Archivo | Qué hace |
|---|---|---|
| 1 | `001_cimientos.sql` | Tablas de personal y permisos |
| 2 | `002_programas.sql` | Módulo 1: categorías, programas, asignaturas, tarifario |
| 3 | `003_credit_rates_delete.sql` | Borrado de versiones del tarifario no usadas, con rastro en `credit_rates_deleted` |
| 4 | `004_estudiantes.sql` | Módulo 2: estudiantes, auditoría de ficha, un correo = un rol |
| 5 | `005_matricula.sql` | Módulo 3: convocatorias, matrículas, registro curricular, retiros/retornos; situación `retiro` |
| 6 | `006_cuentas.sql` | Módulo 4: conceptos, cargos, pagos, becas, bonos, plantillas |
| 7 | `007_bots.sql` | Módulo 5: bots, sesiones, leads, ENLACE, conocimiento (vector), reportes |
| 8 | `008_evaluador.sql` | Módulo 5: sugerencias del supervisor |
| 9 | `009_mejora_continua.sql` | Módulo 6: versionado del prompt |
| 10 | `010_outbound.sql` | Ventas saliente: perfil, campañas, cola |
| 11 | `011_inscripciones.sql` | Ficha de inscripción pública (`enrollment_requests`) |
| 12 | `012_delivery_status.sql` | Estado de entrega de los envíos de campaña (Twilio) |
| … | `00N_*.sql` | Migraciones siguientes, en orden |
| siempre al final | `rls_lockdown.sql` | Blinda todo `public` (RLS + REVOKE anon/authenticated). **Se vuelve a ejecutar después de cada migración.** Idempotente. |

Regla: cada tabla nueva nace con `GRANT ALL ON TABLE x TO service_role` y `ENABLE ROW LEVEL SECURITY` dentro de su propia migración, y después se corre el lockdown por si algo quedó abierto.

Nota: las semillas de `007_bots.sql` nombran a «Madison» en los prompts iniciales; se editan desde `/bots`. Los `DEFAULT 'EUR'` de `002` y `006` se cambian aquí si la institución usa otra moneda (la app toma `APP_CURRENCY`).

Histórico (proyecto de origen): el 2026-08-23 el lockdown se ejecutó antes que `001` (se llamaba `000_`). No tuvo efecto adverso: `001` lleva sus propios GRANT/RLS y el lockdown ya había fijado los privilegios por defecto.
