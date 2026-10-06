import { fichaPorToken, prellenadoDeFicha, programasComerciales } from "@/lib/enroll";
import { APP_NAME, MATRICULA_FEE, PAYMENT_URL, PAYMENT_PROVIDER, APP_CURRENCY } from "@/lib/config";
import { EnrollForm } from "./EnrollForm";

export const metadata = { title: `Ficha de inscripción · ${APP_NAME}` };
export const dynamic = "force-dynamic";

export default async function EnrollPage({ params }: PageProps<"/enroll/[token]">) {
  const { token } = await params;
  const ficha = await fichaPorToken(token);
  const caducada = ficha ? new Date(ficha.expires_at) < new Date() : false;

  return (
    <div className="flex-1 flex items-start justify-center p-6 bg-[#0f2a44]/5">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-6 mt-4">
          <div className="text-2xl font-semibold text-[#0f2a44]">{APP_NAME}</div>
          <div className="text-sm text-slate-500">Ficha de inscripción</div>
        </div>
        {!ficha || caducada ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
            <h1 className="text-lg font-semibold">{caducada ? "Este enlace ha caducado" : "Enlace no válido"}</h1>
            <p className="mt-2 text-sm text-slate-600">Escríbenos por WhatsApp y te enviaremos un enlace de inscripción nuevo.</p>
          </div>
        ) : ["pagada", "formalizada"].includes(ficha.status) ? (
          <div className="bg-white rounded-xl shadow-sm border border-emerald-200 p-8 text-center">
            <h1 className="text-lg font-semibold text-emerald-700">¡Inscripción en marcha! 🎓</h1>
            <p className="mt-2 text-sm text-slate-600">
              Hemos recibido tu inscripción al <b>{ficha.program_name}</b>. El equipo de admisiones te contactará para completar la formalización.
            </p>
          </div>
        ) : ficha.status === "anulada" ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
            <h1 className="text-lg font-semibold">Esta ficha fue anulada</h1>
            <p className="mt-2 text-sm text-slate-600">Si crees que es un error, escríbenos por WhatsApp.</p>
          </div>
        ) : (
          <EnrollForm
            token={token}
            estado={ficha.status as "enviada" | "completada"}
            paymentReference={ficha.payment_reference}
            prellenado={await prellenadoDeFicha(ficha)}
            fichaActual={{
              full_name: ficha.full_name ?? "", document_type: ficha.document_type ?? "DNI",
              document_number: ficha.document_number ?? "", email: ficha.email ?? "",
              birth_date: ficha.birth_date ?? "", city: ficha.city ?? "", country: ficha.country ?? "",
              program_name: ficha.program_name ?? "", notes: ficha.notes ?? "",
            }}
            programas={await programasComerciales()}
            appName={APP_NAME}
            paymentUrl={PAYMENT_URL}
            paymentProvider={PAYMENT_PROVIDER}
            matricula={MATRICULA_FEE}
            moneda={APP_CURRENCY}
          />
        )}
        <p className="text-center text-xs text-slate-400 mt-4">Tus datos se usan únicamente para gestionar tu admisión en {APP_NAME}.</p>
      </div>
    </div>
  );
}
