import "server-only";
import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { DomainError } from "@/lib/enrollments";
import { fetchAll } from "@/lib/db";
import { APP_URL, MATRICULA_FEE, PAYMENT_PROVIDER, PAYMENT_URL, money } from "@/lib/config";

/**
 * Ficha de inscripción pública (2026-09-24). El bot genera un enlace con
 * token; el prospecto completa sus datos y, si hay matrícula configurada
 * (MATRICULA_FEE > 0), la paga en la pasarela (PAYMENT_URL); el equipo
 * confirma el pago y formaliza en Admisión. Sin matrícula configurada la
 * ficha termina al completarse y el equipo decide el siguiente paso.
 * La autenticación de la página pública ES el token (aleatorio, caduca a
 * los 14 días): sin token válido no se lee ni se escribe nada.
 */

/**
 * Texto que el bot y la ficha usan para explicar el pago de la matrícula.
 * Se construye desde la configuración: sin matrícula, no promete pago.
 */
export function textoPagoMatricula(): string {
  if (MATRICULA_FEE <= 0) return "El equipo de admisiones le indicará los siguientes pasos al recibir la ficha.";
  const via = PAYMENT_URL ? ` a través de ${PAYMENT_PROVIDER}` : "";
  return `Al enviarla verá cómo abonar la matrícula (${money(MATRICULA_FEE)})${via}.`;
}

/**
 * Programas que se ofrecen en la ficha pública: salen del plan de estudios
 * (Módulo 1), nunca de una lista escrita a mano. Se añade siempre una
 * opción libre para prospectos indecisos.
 */
export async function programasComerciales(): Promise<string[]> {
  const rows = await fetchAll<{ name: string }>(
    db().from("academic_programs").select("name").order("name"),
  ).catch(() => [] as { name: string }[]);
  const nombres = [...new Set(rows.map((r) => r.name.trim()).filter(Boolean))];
  return [...nombres, "Otro programa / aún no lo sé"];
}

export type EnrollmentRequest = {
  id: string; token: string; bot_key: string | null; lead_id: string | null; phone: string;
  status: "enviada" | "completada" | "pagada" | "formalizada" | "anulada";
  full_name: string | null; document_type: string | null; document_number: string | null;
  email: string | null; birth_date: string | null; city: string | null; country: string | null;
  program_name: string | null; notes: string | null;
  payment_reference: string | null; paid_confirmed_at: string | null; paid_confirmed_by: string | null;
  completed_at: string | null; expires_at: string; created_at: string; updated_at: string;
};

export const ENROLL_COLS =
  "id, token, bot_key, lead_id, phone, status, full_name, document_type, document_number, email, birth_date, city, country, program_name, notes, payment_reference, paid_confirmed_at, paid_confirmed_by, completed_at, expires_at, created_at, updated_at";

const db = () => supabaseAdmin();
const appUrl = () => APP_URL;

/** Crea (o reutiliza si hay una viva) la ficha de un teléfono y devuelve su URL. */
export async function crearFicha(botKey: string, phone: string): Promise<{ url: string; nueva: boolean }> {
  const { data: viva } = await db().from("enrollment_requests")
    .select("token, status, expires_at").eq("phone", phone)
    .in("status", ["enviada", "completada"])
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (viva) return { url: `${appUrl()}/enroll/${viva.token}`, nueva: false };

  const { data: lead } = await db().from("sales_leads").select("id").eq("bot_key", botKey).eq("phone", phone).maybeSingle();
  const token = randomBytes(16).toString("hex");
  const { error } = await db().from("enrollment_requests").insert({ token, bot_key: botKey, lead_id: lead?.id ?? null, phone });
  if (error) throw new DomainError(`enrollment_requests: ${error.message}`, 500);
  if (lead) await db().from("sales_leads").update({ stage: "interesado", qualified: true }).eq("id", lead.id).not("stage", "in", "(inscrito,descartado)");
  return { url: `${appUrl()}/enroll/${token}`, nueva: true };
}

export async function fichaPorToken(token: string): Promise<EnrollmentRequest | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const { data } = await db().from("enrollment_requests").select(ENROLL_COLS).eq("token", token).maybeSingle();
  return (data as EnrollmentRequest) ?? null;
}

/** Datos del lead para prellenar el formulario (solo campos no sensibles). */
export async function prellenadoDeFicha(r: EnrollmentRequest): Promise<Record<string, string>> {
  if (!r.lead_id) return {};
  const { data: lead } = await db().from("sales_leads").select("name, email, specialty_interest").eq("id", r.lead_id).maybeSingle();
  return {
    full_name: r.full_name ?? lead?.name ?? "",
    email: r.email ?? lead?.email ?? "",
    program_name: r.program_name ?? ((await programasComerciales()).includes(lead?.specialty_interest ?? "") ? lead!.specialty_interest! : ""),
  };
}

/** El prospecto completa la ficha (vía token). Lista blanca + validación. */
export async function completarFicha(token: string, datos: Record<string, unknown>): Promise<EnrollmentRequest> {
  const r = await fichaPorToken(token);
  if (!r) throw new DomainError("Ficha no encontrada", 404);
  if (new Date(r.expires_at) < new Date()) throw new DomainError("El enlace ha caducado; pide uno nuevo por WhatsApp", 410);
  if (!["enviada", "completada"].includes(r.status)) throw new DomainError("Esta inscripción ya está en trámite con admisiones", 409);

  const s = (k: string, max = 150) => String(datos[k] ?? "").trim().slice(0, max);
  const full_name = s("full_name");
  const document_number = s("document_number", 40).toUpperCase();
  const email = s("email").toLowerCase();
  const document_type = s("document_type", 10);
  const program_name = s("program_name", 120);
  if (full_name.length < 5) throw new DomainError("Indica tu nombre completo", 400);
  if (!["DNI", "NIE", "PASAPORTE", "OTRO"].includes(document_type)) throw new DomainError("Tipo de documento inválido", 400);
  if (document_number.length < 5) throw new DomainError("Indica tu número de documento", 400);
  if (!/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(email)) throw new DomainError("Correo inválido", 400);
  if (!(await programasComerciales()).includes(program_name)) throw new DomainError("Elige un programa de la lista", 400);
  const birth = s("birth_date", 10);
  if (birth && !/^\d{4}-\d{2}-\d{2}$/.test(birth)) throw new DomainError("Fecha de nacimiento inválida", 400);

  const { data, error } = await db().from("enrollment_requests").update({
    full_name, document_type, document_number, email, program_name,
    birth_date: birth || null, city: s("city") || null, country: s("country", 60) || null,
    notes: s("notes", 500) || null,
    status: "completada", completed_at: r.completed_at ?? new Date().toISOString(),
  }).eq("id", r.id).select(ENROLL_COLS).single();
  if (error) throw new DomainError(error.message, 500);

  if (r.lead_id) {
    await db().from("sales_leads").update({ name: full_name, email, program_interest: program_name }).eq("id", r.lead_id);
  }
  return data as EnrollmentRequest;
}

/** El prospecto declara su referencia de pago (vía token). */
export async function declararPago(token: string, referencia: string): Promise<EnrollmentRequest> {
  const r = await fichaPorToken(token);
  if (!r) throw new DomainError("Ficha no encontrada", 404);
  if (r.status !== "completada") throw new DomainError("Completa primero la ficha", 409);
  const ref = referencia.trim().slice(0, 100);
  if (ref.length < 4) throw new DomainError("Indica la referencia del pago", 400);
  const { data, error } = await db().from("enrollment_requests").update({ payment_reference: ref }).eq("id", r.id).select(ENROLL_COLS).single();
  if (error) throw new DomainError(error.message, 500);
  return data as EnrollmentRequest;
}

/** El equipo confirma el pago (verificado en el panel de la pasarela) o anula. */
export async function decidirFicha(id: string, accion: "confirmar_pago" | "formalizar" | "anular", actor: string): Promise<EnrollmentRequest> {
  const { data: r } = await db().from("enrollment_requests").select(ENROLL_COLS).eq("id", id).maybeSingle();
  if (!r) throw new DomainError("Ficha no encontrada", 404);
  const patch: Record<string, unknown> = {};
  if (accion === "confirmar_pago") {
    if (r.status !== "completada") throw new DomainError(`Solo se confirma el pago de una ficha completada (está ${r.status})`, 409);
    patch.status = "pagada";
    patch.paid_confirmed_at = new Date().toISOString();
    patch.paid_confirmed_by = actor;
  } else if (accion === "formalizar") {
    if (r.status !== "pagada") throw new DomainError(`Solo se formaliza una ficha pagada (está ${r.status})`, 409);
    patch.status = "formalizada";
  } else {
    if (["formalizada"].includes(r.status)) throw new DomainError("No se anula una ficha ya formalizada", 409);
    patch.status = "anulada";
  }
  const { data, error } = await db().from("enrollment_requests").update(patch).eq("id", id).select(ENROLL_COLS).single();
  if (error) throw new DomainError(error.message, 500);
  if (accion === "confirmar_pago" && r.lead_id) {
    await db().from("sales_leads").update({ stage: "inscrito" }).eq("id", r.lead_id);
  }
  return data as EnrollmentRequest;
}
