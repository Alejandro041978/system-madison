import { redirect } from "next/navigation";
import Link from "next/link";
import { guardPage, puedeEditarPagina } from "@/lib/api-guard";
import { searchStudents, nombreCompleto, SITUACIONES } from "@/lib/students";
import { StudentSearch } from "./StudentSearch";
import { NewStudentForm } from "./NewStudentForm";

export const metadata = { title: "Estudiantes" };
export const dynamic = "force-dynamic";

export default async function StudentsPage({ searchParams }: PageProps<"/students">) {
  const identity = await guardPage("students", "/students");
  const sp = await searchParams;

  // Enlace directo ?id=<uuid> (BLUEPRINT): va a la ficha.
  if (typeof sp.id === "string" && sp.id) redirect(`/students/${sp.id}`);

  const q = typeof sp.q === "string" ? sp.q : "";
  const all = sp.all === "1";
  let results: Awaited<ReturnType<typeof searchStudents>> = [];
  let error: string | null = null;
  if (q.trim().length >= 2) {
    try { results = await searchStudents(q, { includeDisabled: all }); } catch (e) { error = (e as Error).message; }
  }
  const canEdit = puedeEditarPagina(identity, "students");

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Estudiantes</h1>
          <p className="text-sm text-slate-500">Busca por nombre, apellidos, documento, correo o teléfono (mínimo 2 caracteres).</p>
        </div>
        {canEdit && <NewStudentForm />}
      </div>

      <StudentSearch q={q} all={all} />
      {error && <div className="mt-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}

      {q.trim().length >= 2 && (
        <div className="mt-4 bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-2 font-medium">Estudiante</th>
                <th className="px-4 py-2 font-medium">Documento</th>
                <th className="px-4 py-2 font-medium">Correo</th>
                <th className="px-4 py-2 font-medium">Teléfono</th>
                <th className="px-4 py-2 font-medium">Situación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.map((s) => (
                <tr key={s.id} className={s.disabled ? "text-slate-400" : ""}>
                  <td className="px-4 py-2"><Link href={`/students/${s.id}`} className="font-medium text-sky-800 hover:underline">{nombreCompleto(s)}</Link>
                    {s.disabled && <span className="ml-2 rounded bg-slate-200 text-slate-700 px-1.5 py-0.5 text-xs">deshabilitado</span>}</td>
                  <td className="px-4 py-2 font-mono text-xs">{s.document_type} {s.document_number}</td>
                  <td className="px-4 py-2 font-mono text-xs">{s.email}</td>
                  <td className="px-4 py-2 font-mono text-xs">{s.phone_number ?? "—"}</td>
                  <td className="px-4 py-2">{SITUACIONES[s.situation]}{s.situation_source === "manual" && <span className="ml-1 text-xs text-amber-700">(manual)</span>}</td>
                </tr>
              ))}
              {results.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Sin resultados para «{q}».</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
