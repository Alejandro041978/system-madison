import Link from "next/link";
import Image from "next/image";
import { currentAuthUser } from "@/lib/identity";
import { APP_NAME } from "@/lib/config";
import { SetPasswordForm } from "./SetPasswordForm";

export const metadata = { title: "Elegir contraseña" };
export const dynamic = "force-dynamic";

/**
 * Aterrizaje del enlace de invitación. /api/auth/confirm ya abrió la
 * sesión; aquí el colaborador elige su contraseña. Sin sesión (enlace
 * caducado, usado o manipulado) se explica qué hacer.
 */
export default async function SetPasswordPage({ searchParams }: PageProps<"/auth/set-password">) {
  const sp = await searchParams;
  const auth = await currentAuthUser();
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-br from-plum via-plum-dark to-[#2a0f36]">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8">
        <Image src="/brand/logo.png" alt={APP_NAME} width={256} height={256} priority className="h-16 w-16 rounded-2xl shadow-sm" />
        <h1 className="mt-4 text-xl font-semibold text-plum-dark">{APP_NAME}</h1>
        {auth && !error ? (
          <>
            <p className="text-sm text-slate-500 mb-6">Elige la contraseña para <b>{auth.email}</b>.</p>
            <SetPasswordForm />
          </>
        ) : (
          <>
            <p className="text-sm text-slate-500 mt-2">
              {error === "caducado"
                ? "Este enlace ya se usó o ha caducado."
                : "Este enlace no es válido."}
              {" "}Pide una invitación nueva a quien te dio de alta y abre el correo más reciente.
            </p>
            <Link href="/login" className="inline-block mt-6 text-sm text-plum hover:underline">Ir al inicio de sesión</Link>
          </>
        )}
      </div>
    </div>
  );
}
