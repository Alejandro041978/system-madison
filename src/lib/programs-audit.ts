import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";
import { tarifaVigente } from "@/lib/rates";

/**
 * AUDITOR del Módulo 1. Reporta; no corrige. Avisa de todo lo que bloquea
 * un proceso posterior (una matrícula sin tarifa, una malla vacía…).
 */

export type Hallazgo = {
  severidad: "bloquea" | "aviso";
  tipo: string;
  mensaje: string;
  programa_id?: string;
  categoria_id?: string;
};

type Cat = { id: string; name: string; passing_score: number | null };
type Prog = { id: string; name: string; code: string; category_id: string; active: boolean };
type Course = { id: string; program_id: string; name: string; code: string; credits: number; active: boolean; graduation_requirement: boolean };

export async function auditarProgramas(): Promise<{ hallazgos: Hallazgo[]; resumen: Record<string, number> }> {
  const db = supabaseAdmin();
  const [cats, progs, courses] = await Promise.all([
    fetchAll<Cat>(db.from("academic_programs_category").select("id, name, passing_score").order("name")),
    fetchAll<Prog>(db.from("academic_programs").select("id, name, code, category_id, active").order("name")),
    fetchAll<Course>(db.from("academic_courses").select("id, program_id, name, code, credits, active, graduation_requirement").order("id")),
  ]);

  const h: Hallazgo[] = [];

  for (const c of cats) {
    if (c.passing_score === null || c.passing_score === undefined) {
      h.push({ severidad: "bloquea", tipo: "categoria_sin_nota_minima", mensaje: `La categoría «${c.name}» no tiene nota mínima aprobatoria`, categoria_id: c.id });
    }
    if (!progs.some((p) => p.category_id === c.id)) {
      h.push({ severidad: "aviso", tipo: "categoria_sin_programas", mensaje: `La categoría «${c.name}» no tiene programas`, categoria_id: c.id });
    }
  }

  for (const p of progs.filter((p) => p.active)) {
    const malla = courses.filter((c) => c.program_id === p.id && c.active);
    if (malla.length === 0) {
      h.push({ severidad: "bloquea", tipo: "programa_sin_malla", mensaje: `«${p.name}» (${p.code}) no tiene asignaturas: una matrícula no tendría registro curricular`, programa_id: p.id });
    } else {
      const creditos = malla.reduce((s, c) => s + Number(c.credits), 0);
      if (creditos === 0) {
        h.push({ severidad: "bloquea", tipo: "programa_cero_creditos", mensaje: `«${p.name}» suma 0 créditos: la tuition sería 0`, programa_id: p.id });
      }
      for (const c of malla.filter((c) => Number(c.credits) === 0)) {
        h.push({ severidad: "aviso", tipo: "asignatura_cero_creditos", mensaje: `«${c.name}» (${c.code}) de «${p.name}» tiene 0 créditos`, programa_id: p.id });
      }
      if (!malla.some((c) => c.graduation_requirement)) {
        h.push({ severidad: "aviso", tipo: "programa_sin_requisitos_grado", mensaje: `«${p.name}» no tiene ninguna asignatura como requisito de titulación`, programa_id: p.id });
      }
    }
    const tarifa = await tarifaVigente(p.id);
    if (!tarifa) {
      h.push({ severidad: "bloquea", tipo: "programa_sin_tarifa", mensaje: `«${p.name}» (${p.code}) no tiene tarifa vigente ni propia ni de categoría: no se puede matricular`, programa_id: p.id });
    }
  }

  const resumen: Record<string, number> = { bloquea: 0, aviso: 0 };
  for (const x of h) resumen[x.severidad]++;
  return { hallazgos: h, resumen };
}
