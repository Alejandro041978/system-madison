import { validarWebhook, twiml } from "@/lib/twilio";
import { botPorNumero, procesarMensaje } from "@/lib/bots/engine";

/**
 * Webhook de WhatsApp (Twilio). Público a propósito: la autenticidad la da
 * la firma HMAC de Twilio + AccountSid (validarWebhook); el proxy lo deja
 * pasar sin sesión (está bajo /api/whatsapp, no es ruta de gestión).
 *
 * En desarrollo, sin dominio público, se acepta la cabecera
 * x-dev-secret: CRON_SECRET para poder simular peticiones (2026-08-23).
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;

  // URL pública que Twilio firmó (detrás del proxy de Vercel el host llega en x-forwarded-*).
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const publicUrl = `${proto}://${host}${url.pathname}`;

  const devBypass = !!process.env.CRON_SECRET && req.headers.get("x-dev-secret") === process.env.CRON_SECRET;
  if (!devBypass) {
    const v = validarWebhook(publicUrl, params, req.headers.get("x-twilio-signature"));
    if (!v.ok) {
      console.warn("[webhook] rechazado:", v.motivo);
      return new Response("Forbidden", { status: 403 });
    }
  }

  const to = params.To ?? "";
  const from = (params.From ?? "").replace("whatsapp:", "");
  const body = (params.Body ?? "").trim();
  const numMedia = Number(params.NumMedia ?? "0");

  const bot = await botPorNumero(to);
  if (!bot || !bot.active) {
    console.warn(`[webhook] sin bot activo para ${to}`);
    return twiml(); // 200 vacío: Twilio no reintenta
  }
  if (!from) return twiml();

  // Media: se anota para el modelo; la descarga autenticada llega con el helpdesk.
  const notaMedia = numMedia > 0 ? `[El cliente adjuntó ${numMedia} archivo(s): ${params.MediaContentType0 ?? "desconocido"}]` : null;
  if (!body && !notaMedia) return twiml();

  const textos = await procesarMensaje(bot, from, body, notaMedia);
  return twiml(...textos);
}
