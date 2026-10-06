import { LoginForm } from "./LoginForm";
import { APP_NAME } from "@/lib/config";

export const metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/";
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-xl font-semibold">{APP_NAME}</h1>
        <p className="text-sm text-slate-500 mb-6">Acceso del personal</p>
        <LoginForm next={next} />
      </div>
    </div>
  );
}
