"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

export type ProgramOption = { id: string; code: string; name: string; category_id: string };
type StudentHit = { id: string; first_name: string; last_name: string; second_last_name: string | null; document_number: string; email: string; situation: string };

const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white w-full";

export function NewEnrollmentForm(p: { convocatoria: { id: string; name: string; category_id: string }; programs: ProgramOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [student, setStudent] = useState<StudentHit | null>(null);
  const [programId, setProgramId] = useState(p.programs[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  function buscar(valor: string) {
    setQ(valor);
    if (timer) clearTimeout(timer);
    if (valor.trim().length < 2) { setHits([]); return; }
    setTimer(setTimeout(async () => {
      const res = await fetch(`/api/students?q=${encodeURIComponent(valor)}`);
      if (res.ok) setHits(await res.json());
    }, 250));
  }

  async function matricular() {
    if (!student || !programId) return;
    setError(null); setBusy(true);
    const res = await fetch("/api/admissions/enrollments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_id: student.id, program_id: programId, convocatoria_id: p.convocatoria.id, enrollment_date: date || undefined }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
    router.push(`/admissions/enrollments/${json.enrollment.id}`);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} disabled={p.programs.length === 0} title={p.programs.length === 0 ? "No hay programas activos en esta categoría" : ""}
        className="inline-flex items-center gap-1.5 rounded-md bg-[#0f2a44] text-white px-3 py-1.5 text-sm hover:bg-[#163a5c] disabled:opacity-50">
        <Plus className="h-4 w-4" /> Nueva matrícula
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-20 bg-black/30 flex items-start justify-center pt-20" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 w-full max-w-xl">
        <h2 className="text-lg font-semibold">Nueva matrícula</h2>
        <div className="text-sm text-slate-500 mb-4">{p.convocatoria.name}</div>
        {error && <div className="mb-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}

        <div className="space-y-3 text-sm">
          <div>
            <div className="text-slate-600 mb-1">Estudiante</div>
            {student ? (
              <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                <div><b>{student.first_name} {student.last_name} {student.second_last_name ?? ""}</b> <span className="text-xs text-slate-500 font-mono">{student.document_number}</span></div>
                <button onClick={() => { setStudent(null); setQ(""); }} className="text-xs text-slate-500 hover:underline">cambiar</button>
              </div>
            ) : (
              <>
                <input autoFocus className={input} placeholder="Buscar por nombre, documento, correo o teléfono…" value={q} onChange={(e) => buscar(e.target.value)} />
                {hits.length > 0 && (
                  <ul className="mt-1 border border-slate-200 rounded-md divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    {hits.map((h) => (
                      <li key={h.id}><button onClick={() => setStudent(h)} className="w-full text-left px-3 py-1.5 hover:bg-slate-50">
                        {h.first_name} {h.last_name} {h.second_last_name ?? ""} <span className="text-xs text-slate-500 font-mono">{h.document_number} · {h.email}</span>
                      </button></li>
                    ))}
                  </ul>
                )}
                <div className="mt-1 text-xs text-slate-400">¿No existe? Créalo primero en <Link href="/students" className="text-sky-700 hover:underline">Estudiantes</Link>.</div>
              </>
            )}
          </div>
          <label className="block"><div className="text-slate-600 mb-1">Programa (categoría de la convocatoria)</div>
            <select className={input} value={programId} onChange={(e) => setProgramId(e.target.value)}>
              {p.programs.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
            </select></label>
          <label className="block"><div className="text-slate-600 mb-1">Fecha de matrícula (vacío = hoy; fija la tarifa congelada)</div>
            <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>

        <div className="mt-5 flex gap-3 justify-end">
          <button onClick={() => setOpen(false)} className="text-sm text-slate-500 hover:underline">Cancelar</button>
          <button onClick={matricular} disabled={!student || !programId || busy} className="rounded-md bg-[#0f2a44] text-white px-4 py-1.5 text-sm disabled:opacity-50">
            {busy ? "Matriculando…" : "Matricular"}
          </button>
        </div>
      </div>
    </div>
  );
}
