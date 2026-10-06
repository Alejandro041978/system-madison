import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Estudiantes: lectura, búsqueda e IDENTIFICACIÓN en una sola función
 * (la usarán los bots del Módulo 5 y la matrícula del Módulo 3).
 */

export type Student = {
  id: string;
  first_name: string;
  last_name: string;
  second_last_name: string | null;
  document_type: "DNI" | "NIE" | "PASAPORTE" | "OTRO";
  document_number: string;
  email: string;
  email_alt: string | null;
  phone_code: string | null;
  phone_local: string | null;
  phone_number: string | null;
  date_of_birth: string | null;
  city: string | null;
  country: string;
  situation: "activo" | "egresado" | "retiro" | "campus_socio";
  situation_source: "auto" | "manual";
  situation_note: string | null;
  disabled: boolean;
  external_id: string | null;
  notes: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export const STUDENT_COLS =
  "id, first_name, last_name, second_last_name, document_type, document_number, email, email_alt, phone_code, phone_local, phone_number, date_of_birth, city, country, situation, situation_source, situation_note, disabled, external_id, notes, updated_by, created_at, updated_at";

/** Campos que la ficha puede editar (lista blanca). situation NO está: se deriva. */
export const STUDENT_EDITABLE = [
  "first_name", "last_name", "second_last_name", "document_type", "document_number",
  "email", "email_alt", "phone_code", "phone_local", "date_of_birth", "city", "country",
  "disabled", "external_id", "notes",
] as const;

export const SITUACIONES: Record<Student["situation"], string> = {
  activo: "Activo",
  egresado: "Egresado",
  retiro: "Retiro",
  campus_socio: "Campus socio",
};

export function nombreCompleto(s: Pick<Student, "first_name" | "last_name" | "second_last_name">) {
  return [s.first_name, s.last_name, s.second_last_name].filter(Boolean).join(" ");
}

export async function getStudent(id: string): Promise<Student | null> {
  const { data, error } = await supabaseAdmin().from("academic_students").select(STUDENT_COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Student) ?? null;
}

/**
 * Buscador (≥2 caracteres): nombre, apellidos, documento, correo o teléfono.
 * Excluye deshabilitados salvo que se pida lo contrario.
 */
export async function searchStudents(q: string, opts: { includeDisabled?: boolean; limit?: number } = {}): Promise<Student[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const like = `%${term.replace(/[%_,]/g, " ")}%`;
  const digits = term.replace(/[^0-9]/g, "");
  let query = supabaseAdmin()
    .from("academic_students")
    .select(STUDENT_COLS)
    .or(
      [
        `first_name.ilike.${like}`,
        `last_name.ilike.${like}`,
        `second_last_name.ilike.${like}`,
        `document_number.ilike.${like}`,
        `email.ilike.${like}`,
        `email_alt.ilike.${like}`,
        ...(digits.length >= 4 ? [`phone_number.ilike.%${digits}%`] : []),
      ].join(","),
    )
    .order("last_name")
    .order("first_name")
    .limit(opts.limit ?? 50);
  if (!opts.includeDisabled) query = query.eq("disabled", false);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Student[];
}

/**
 * IDENTIFICACIÓN — una sola función para toda la casa.
 * Devuelve coincidencias NO deshabilitadas. El que llama decide qué hacer
 * con 0, 1 o varias (el bot de retención exige coincidencia única; el de
 * soporte pide segunda prueba cuando identifica por documento).
 */
export async function identificarEstudiante(by: { phone?: string; email?: string; document?: string }): Promise<Student[]> {
  const db = supabaseAdmin();
  let q = db.from("academic_students").select(STUDENT_COLS).eq("disabled", false);
  if (by.phone) {
    const digits = by.phone.replace(/[^0-9]/g, "");
    if (!digits) return [];
    q = q.eq("phone_number", `+${digits}`);
  } else if (by.email) {
    const e = by.email.trim().toLowerCase();
    q = q.or(`email.eq.${e},email_alt.eq.${e}`);
  } else if (by.document) {
    q = q.eq("document_number", by.document.replace(/\s/g, "").toUpperCase());
  } else {
    return [];
  }
  const { data, error } = await q.limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []) as Student[];
}
