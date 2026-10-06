import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { STUDENT_COLS, STUDENT_EDITABLE, getStudent, searchStudents } from "@/lib/students";
import { recomputeSituations } from "@/lib/situations";

const DOC_TYPES = ["DNI", "NIE", "PASAPORTE", "OTRO"];

function errorDb(e: { code?: string; message: string }) {
  if (e.code === "23505") {
    if (e.message.includes("un solo rol")) return NextResponse.json({ error: e.message.replace(/^.*?:\s*/, "") }, { status: 409 });
    if (e.message.includes("document")) return NextResponse.json({ error: "Ya existe un estudiante con ese documento" }, { status: 409 });
    if (e.message.includes("email")) return NextResponse.json({ error: "Ya existe un estudiante con ese correo" }, { status: 409 });
    return NextResponse.json({ error: "Dato duplicado" }, { status: 409 });
  }
  if (e.code === "23514") return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  if (e.code === "22007" || e.code === "22008") return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  return NextResponse.json({ error: e.message }, { status: 500 });
}

/** Lista blanca + normalización. Devuelve error de validación o el objeto listo. */
function sanear(body: Record<string, unknown>, creando: boolean): { error?: string; data?: Record<string, unknown> } {
  const out: Record<string, unknown> = {};
  for (const k of STUDENT_EDITABLE) {
    if (!(k in body)) continue;
    const v = body[k];
    if (k === "disabled") out[k] = !!v;
    else if (typeof v === "string") out[k] = v.trim() === "" ? null : v.trim();
    else out[k] = v ?? null;
  }
  if (out.email) out.email = String(out.email).toLowerCase();
  if (out.email_alt) out.email_alt = String(out.email_alt).toLowerCase();
  if (out.country) out.country = String(out.country).toUpperCase().slice(0, 3);
  if (out.document_type && !DOC_TYPES.includes(String(out.document_type))) return { error: "Tipo de documento inválido" };
  if (out.email && !String(out.email).includes("@")) return { error: "Correo inválido" };
  if (creando) {
    for (const req of ["first_name", "last_name", "document_number", "email"]) {
      if (!out[req]) return { error: "Nombre, apellido, documento y correo son obligatorios" };
    }
  } else {
    for (const req of ["first_name", "last_name", "document_number", "email"]) {
      if (req in out && !out[req]) return { error: `${req} no puede quedar vacío` };
    }
  }
  return { data: out };
}

/** GET ?id=<uuid> | ?q=<texto ≥2> [&all=1 incluye deshabilitados] */
export async function GET(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const sp = new URL(req.url).searchParams;
  try {
    const id = sp.get("id");
    if (id) {
      const s = await getStudent(id);
      return s ? NextResponse.json(s) : NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    const q = sp.get("q") ?? "";
    if (q.trim().length < 2) return NextResponse.json({ error: "Escribe al menos 2 caracteres" }, { status: 400 });
    return NextResponse.json(await searchStudents(q, { includeDisabled: sp.get("all") === "1" }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  const s = sanear(body, true);
  if (s.error) return NextResponse.json({ error: s.error }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from("academic_students")
    .insert({ ...s.data, updated_by: g.identity.email })
    .select(STUDENT_COLS)
    .single();
  if (error) return errorDb(error);
  await recomputeSituations({ studentIds: [data.id], actor: g.identity.email }).catch(() => null);
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: Request) {
  const g = await guardApi(req);
  if (!g.ok) return g.response;
  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const s = sanear(body, false);
  if (s.error) return NextResponse.json({ error: s.error }, { status: 400 });
  if (Object.keys(s.data!).length === 0) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from("academic_students")
    .update({ ...s.data, updated_by: g.identity.email })
    .eq("id", body.id)
    .select(STUDENT_COLS)
    .single();
  if (error) return errorDb(error);
  return NextResponse.json(data);
}
