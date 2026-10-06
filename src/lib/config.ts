/**
 * Parámetros de la institución (2026-10-06). Todo lo que en el proyecto de
 * origen era una decisión de negocio fija (nombre, moneda, tasas, pasarela)
 * vive aquí y se lee de variables de entorno. Sin valor configurado, las
 * tasas son 0 y los flujos que dependían de un pago no lo exigen.
 *
 * Un dato, una función: ninguna pantalla ni librería escribe estos valores
 * por su cuenta; todas importan de aquí.
 */

const num = (v: string | undefined, def = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : def;
};

/** Nombre de la institución tal como se muestra (sidebar, login, bots, correos). */
export const APP_NAME = process.env.APP_NAME?.trim() || "Madison";

/** Moneda por defecto de tarifas y cargos (ISO 4217). */
export const APP_CURRENCY = (process.env.APP_CURRENCY?.trim() || "EUR").toUpperCase().slice(0, 3);

/** Tasa del trámite «Retorno» tras un retiro. 0 = el retorno no exige pago. */
export const RETORNO_FEE = num(process.env.RETORNO_FEE, 0);

/** Importe de la matrícula que paga el prospecto al completar la ficha pública. 0 = sin paso de pago en línea. */
export const MATRICULA_FEE = num(process.env.MATRICULA_FEE, 0);

/** Enlace de pago de la matrícula (pasarela externa). Vacío = sin botón de pago. */
export const PAYMENT_URL = process.env.PAYMENT_URL?.trim() || "";

/** Nombre de la pasarela de pago, para los textos (ej. «Flywire», «Stripe»). */
export const PAYMENT_PROVIDER = process.env.PAYMENT_PROVIDER?.trim() || "la pasarela de pago";

/** URL pública de la app (enlaces que salen por WhatsApp y correo). */
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");

/** Formato de importe con la moneda configurada. */
export const money = (n: number, cur = APP_CURRENCY) =>
  n.toLocaleString("es-ES", { style: "currency", currency: cur, maximumFractionDigits: 2 });
