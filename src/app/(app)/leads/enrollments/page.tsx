import Link from "next/link";
import { guardPage, puedeEditarPagina } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/db";
import { ENROLL_COLS, type EnrollmentRequest } from "@/lib/enroll";
import { RequestsTable } from "./RequestsTable";

export const metadata = { title: "Inscripciones" };
export const dynamic = "force-dynamic";

export default async function EnrollmentRequestsPage() {
  const identity = await guardPage("leads", "/leads/enrollments");
  const filas = await fetchAll<EnrollmentRequest>(
    supabaseAdmin().from("enrollment_requests").select(ENROLL_COLS).order("created_at", { ascending: false }),
  );
  const pendientes = filas.filter((f) => f.status === "completada").length;

  return (
    <div>
      <Link href="/leads" className="text-sm text-sky-700 hover:underline">← Leads</Link>
      <div className="mt-2 mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fichas de inscripción</h1>
          <p className="text-sm text-slate-500">
            Las genera el bot cuando un prospecto decide inscribirse. Verifica el pago en el panel de la pasarela (referencia del prospecto) antes de confirmarlo; al confirmar, el lead pasa a «inscrito» y queda listo para formalizar en Admisión.
          </p>
        </div>
        <div className="text-sm">
          {pendientes > 0 && <span className="rounded bg-amber-100 text-amber-800 px-2 py-1">{pendientes} esperando verificación de pago</span>}
        </div>
      </div>
      <RequestsTable filas={filas} canEdit={puedeEditarPagina(identity, "leads")} />
    </div>
  );
}
