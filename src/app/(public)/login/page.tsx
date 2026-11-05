import Image from "next/image";
import { LoginForm } from "./LoginForm";
import { APP_NAME } from "@/lib/config";

export const metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/";
  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-br from-plum via-plum-dark to-[#2a0f36]">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8">
        <Image src="/brand/logo.png" alt={APP_NAME} width={256} height={256} priority className="h-16 w-16 rounded-2xl shadow-sm" />
        <h1 className="mt-4 text-xl font-semibold text-plum-dark">{APP_NAME}</h1>
        <p className="text-sm text-slate-500 mb-6">Acceso del personal</p>
        <LoginForm next={next} />
      </div>
    </div>
  );
}
