const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ── MercadoPago ──
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || "",
});
const preference = new Preference(client);
const payment = new Payment(client);

// ── Config ──
const GMAIL_USER          = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD  = process.env.GMAIL_APP_PASSWORD;
const ADMIN_EMAIL         = process.env.ADMIN_EMAIL || "valentingonzalezescritorio@gmail.com";
const BASE_URL            = process.env.BASE_URL || "https://flash-tech-arg.vercel.app";
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_API_KEY    = process.env.FIREBASE_API_KEY;

// ── Transporter Nodemailer (Gmail) ──
function crearTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD,
    },
  });
}

// ── Guardar pedido en Firestore (REST API) ──
async function guardarPedido(preferenceId, datos) {
  if (!FIREBASE_PROJECT_ID || !FIREBASE_API_KEY) return;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/pedidos/${preferenceId}?key=${FIREBASE_API_KEY}`;
    await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          nombre:    { stringValue: datos.nombre    || "" },
          email:     { stringValue: datos.email     || "" },
          telefono:  { stringValue: datos.tel       || "" },
          producto:  { stringValue: datos.producto  || "" },
          precioUSD: { integerValue: datos.precioUSD || 0 },
          createdAt: { stringValue: new Date().toISOString() },
        },
      }),
    });
    console.log("✅ Pedido guardado:", preferenceId);
  } catch (err) {
    console.error("Error guardando pedido:", err);
  }
}

// ── Leer pedido de Firestore ──
async function leerPedido(preferenceId) {
  if (!FIREBASE_PROJECT_ID || !FIREBASE_API_KEY || !preferenceId) return null;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/pedidos/${preferenceId}?key=${FIREBASE_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.fields) return null;
    return {
      nombre:    data.fields.nombre?.stringValue    || "",
      email:     data.fields.email?.stringValue     || "",
      telefono:  data.fields.telefono?.stringValue  || "",
      producto:  data.fields.producto?.stringValue  || "",
      precioUSD: data.fields.precioUSD?.integerValue || 0,
    };
  } catch (err) {
    console.error("Error leyendo pedido:", err);
    return null;
  }
}

// ── Verificar si el pago ya fue procesado ──
async function pagoYaProcesado(pagoId) {
  if (!FIREBASE_PROJECT_ID || !FIREBASE_API_KEY) return false;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/pagos_procesados/${pagoId}?key=${FIREBASE_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.fields?.procesado?.booleanValue;
  } catch {
    return false;
  }
}

// ── Marcar pago como procesado ──
async function marcarPagoProcesado(pagoId) {
  if (!FIREBASE_PROJECT_ID || !FIREBASE_API_KEY) return;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/pagos_procesados/${pagoId}?key=${FIREBASE_API_KEY}`;
    await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          procesado: { booleanValue: true },
          timestamp: { stringValue: new Date().toISOString() },
        },
      }),
    });
    console.log("🔒 Pago marcado como procesado:", pagoId);
  } catch (err) {
    console.error("Error marcando pago procesado:", err);
  }
}

// ── Enviar email con Nodemailer ──
async function enviarEmail({ to, subject, html }) {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.warn("⚠️ Sin GMAIL_USER o GMAIL_APP_PASSWORD — email no enviado");
    return;
  }
  try {
    const transporter = crearTransporter();
    const info = await transporter.sendMail({
      from: `"Flash Tech ARG" <${GMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log("📧 Email enviado OK:", info.messageId);
    console.log("📧 Respuesta SMTP:", JSON.stringify(info.response));
    console.log("📧 Rechazados:", JSON.stringify(info.rejected));
    console.log("📧 Aceptados:", JSON.stringify(info.accepted));
    return info;
  } catch (err) {
    console.error("❌ Error enviando email:", err.message);
    console.error("❌ Error completo:", JSON.stringify(err));
  }
}

// ── Template CLIENTE ──
function templateCliente({ nombre, producto, precio, referencia }) {
  return `<!DOCTYPE html><html lang="es">
  <body style="margin:0;padding:0;background:#f4f4f4;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
  <tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="background:#0a0a0a;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
    <tr><td style="background:linear-gradient(135deg,#0d2200,#0a0a0a);padding:36px 40px;text-align:center;border-bottom:3px solid #7fff00;">
      <div style="font-size:28px;font-weight:900;text-transform:uppercase;">
        <span style="color:#fff;">Flash</span><span style="color:#7fff00;">Tech</span> <span style="color:#fff;">ARG</span>
      </div>
      <div style="color:#888;font-size:13px;margin-top:4px;letter-spacing:2px;text-transform:uppercase;">Apple Store · Córdoba</div>
    </td></tr>
    <tr><td style="background:#7fff00;padding:14px 40px;text-align:center;">
      <span style="color:#000;font-weight:800;font-size:14px;letter-spacing:2px;text-transform:uppercase;">✅ PAGO CONFIRMADO</span>
    </td></tr>
    <tr><td style="padding:40px;">
      <p style="color:#c8c8c8;font-size:16px;margin:0 0 16px;">Hola <strong style="color:#fff;">${nombre}</strong>,</p>
      <p style="color:#c8c8c8;font-size:15px;line-height:1.6;margin:0 0 28px;">Tu pago fue procesado exitosamente. En menos de 1 hora te contactamos para coordinar la entrega.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid rgba(127,255,0,.2);border-radius:4px;margin-bottom:28px;">
        <tr><td style="padding:14px 20px;border-bottom:1px solid rgba(255,255,255,.06);">
          <span style="color:#7fff00;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Detalle del pedido</span>
        </td></tr>
        <tr><td style="padding:18px 20px;">
          <table width="100%">
            <tr><td style="color:#888;font-size:13px;padding-bottom:10px;">Producto</td><td style="color:#fff;font-weight:700;font-size:13px;text-align:right;padding-bottom:10px;">${producto}</td></tr>
            <tr><td style="color:#888;font-size:13px;padding-bottom:10px;">Total pagado</td><td style="color:#7fff00;font-size:18px;font-weight:900;text-align:right;padding-bottom:10px;">USD ${precio}</td></tr>
            <tr><td style="color:#888;font-size:13px;">N° referencia</td><td style="color:#666;font-size:11px;text-align:right;font-family:monospace;">${referencia}</td></tr>
          </table>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid rgba(127,255,0,.12);border-radius:4px;margin-bottom:28px;">
        <tr><td style="padding:14px 20px;border-bottom:1px solid rgba(255,255,255,.06);">
          <span style="color:#7fff00;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">¿Qué sigue?</span>
        </td></tr>
        <tr><td style="padding:18px 20px;">
          <p style="color:#c8c8c8;font-size:14px;margin:0 0 8px;">⚡ <strong style="color:#fff;">En menos de 1 hora</strong> te contactamos por WhatsApp.</p>
          <p style="color:#c8c8c8;font-size:14px;margin:0 0 8px;">📦 <strong style="color:#fff;">Entrega en Córdoba Capital</strong> el mismo día.</p>
          <p style="color:#c8c8c8;font-size:14px;margin:0;">🚚 <strong style="color:#fff;">Envíos al interior</strong> coordinados por correo.</p>
        </td></tr>
      </table>
      <table width="100%"><tr><td align="center">
        <a href="https://wa.me/5493512020116" style="display:inline-block;background:#25D366;color:#fff;padding:13px 30px;font-weight:800;font-size:14px;text-decoration:none;border-radius:3px;">💬 Escribinos por WhatsApp</a>
      </td></tr></table>
    </td></tr>
    <tr><td style="background:#050505;padding:22px 40px;text-align:center;border-top:1px solid rgba(255,255,255,.06);">
      <p style="color:#555;font-size:12px;margin:0 0 4px;">Flash Tech ARG · Córdoba Capital, Argentina</p>
      <p style="color:#555;font-size:12px;margin:0;">📱 351 2020116 · 📸 @flashtech.arg</p>
    </td></tr>
  </table>
  </td></tr></table>
  </body></html>`;
}

// ── Template ADMIN ──
function templateAdmin({ nombre, email, telefono, producto, precio, referencia }) {
  return `<!DOCTYPE html><html lang="es">
  <body style="margin:0;padding:20px;background:#f4f4f4;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" style="max-width:500px;margin:0 auto;background:#0a0a0a;border:2px solid #7fff00;border-radius:8px;overflow:hidden;">
    <tr><td style="background:#7fff00;padding:14px 24px;">
      <strong style="color:#000;font-size:16px;">⚡ NUEVA VENTA — Flash Tech ARG</strong>
    </td></tr>
    <tr><td style="padding:24px;">
      <table width="100%">
        <tr><td style="color:#888;font-size:13px;padding:5px 0;">Producto</td><td style="color:#fff;font-weight:700;font-size:13px;">${producto}</td></tr>
        <tr><td style="color:#888;font-size:13px;padding:5px 0;">Precio</td><td style="color:#7fff00;font-weight:900;font-size:16px;">USD ${precio}</td></tr>
        <tr><td colspan="2" style="padding:12px 0 6px;color:#7fff00;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;border-top:1px solid rgba(255,255,255,.08);margin-top:8px;">Comprador</td></tr>
        <tr><td style="color:#888;font-size:13px;padding:5px 0;">Nombre</td><td style="color:#fff;font-size:13px;">${nombre}</td></tr>
        <tr><td style="color:#888;font-size:13px;padding:5px 0;">Email</td><td style="color:#fff;font-size:13px;">${email}</td></tr>
        <tr><td style="color:#888;font-size:13px;padding:5px 0;">Teléfono</td><td style="color:#fff;font-size:13px;">${telefono || "No ingresado"}</td></tr>
        <tr><td style="color:#888;font-size:13px;padding:5px 0;">Referencia</td><td style="color:#666;font-size:11px;font-family:monospace;">${referencia}</td></tr>
      </table>
      <div style="margin-top:20px;text-align:center;">
        <a href="https://wa.me/549${(telefono).replace(/\D/g, "")}" style="background:#25D366;color:#fff;padding:10px 24px;font-weight:700;font-size:13px;text-decoration:none;border-radius:3px;display:inline-block;">Contactar por WhatsApp →</a>
      </div>
    </td></tr>
  </table>
  </body></html>`;
}

// ── CREAR PAGO ──
app.post("/api/crear-pago", async (req, res) => {
  const { producto, precio, cantidad = 1, comprador } = req.body;
  if (!producto || !precio) {
    return res.status(400).json({ error: "Faltan datos" });
  }
  try {
    const body = {
      items: [{ title: producto, quantity: Number(cantidad), unit_price: Number(precio), currency_id: "ARS" }],
      payer: comprador ? { name: comprador.nombre, email: comprador.email, phone: { number: comprador.tel || "" } } : {},
      back_urls: {
        success: `${BASE_URL}/exito.html`,
        failure: `${BASE_URL}/error.html`,
        pending: `${BASE_URL}/pendiente.html`,
      },
      auto_return: "approved",
      statement_descriptor: "FLASH TECH ARG",
      external_reference: `FT-${Date.now()}`,
      notification_url: `${BASE_URL}/api/webhook`,
    };

    const result = await preference.create({ body });

    if (comprador && result.id) {
      await guardarPedido(result.id, {
        ...comprador,
        producto,
        precioUSD: Math.round(Number(precio) / 1200),
      });
    }

    res.json({ id: result.id, init_point: result.init_point });
  } catch (error) {
    console.error("Error MP:", error);
    res.status(500).json({ error: error.message });
  }
});

// ── WEBHOOK ──
app.post("/api/webhook", async (req, res) => {
  console.log("📩 WEBHOOK RECIBIDO");
  console.log("BODY:", JSON.stringify(req.body));
  console.log("QUERY:", JSON.stringify(req.query));

  const type   = req.body.type  || req.body.topic  || req.query.type  || req.query.topic;
  const dataId = req.body.data?.id || req.query["data.id"] || req.query.id || req.body.id;

  console.log("TIPO:", type);
  console.log("DATA ID:", dataId);

  try {
    // ✅ Verificar duplicado ANTES de procesar
    if (await pagoYaProcesado(dataId)) {
      console.log("⚠️ Pago ya procesado, ignorando duplicado:", dataId);
      return res.sendStatus(200);
    }
    await marcarPagoProcesado(dataId);

    console.log("🔍 Consultando pago en MP:", dataId);
    const pago = await payment.get({ id: dataId });

    const prefId = pago.preference_id || pago.external_reference;
    console.log("💳 Status:", pago.status, "| prefId:", prefId);

    if (pago.status !== "approved") {
      console.log("⏳ Pago no aprobado, status:", pago.status);
      return res.sendStatus(200);
    }

    const comprador = await leerPedido(prefId);
    console.log("👤 Comprador Firestore:", JSON.stringify(comprador));

    const referencia = `FT-${pago.id}`;
    const nombre     = comprador?.nombre    || pago.payer?.first_name || "Cliente";
    const emailDst   = comprador?.email     || pago.payer?.email      || "";
    const telefono   = comprador?.telefono  || "";
    const producto   = comprador?.producto  || "Producto Apple";
    const precio     = comprador?.precioUSD || Math.round(pago.transaction_amount / 1200);

    console.log("📧 Destinatario cliente:", emailDst);

    if (emailDst) {
      await enviarEmail({
        to: emailDst,
        subject: "✅ Compra confirmada — Flash Tech ARG",
        html: templateCliente({ nombre, producto, precio, referencia }),
      });
      console.log("✅ Email cliente enviado");
    } else {
      console.warn("⚠️ Sin email de destino para el cliente");
    }

    await enviarEmail({
      to: ADMIN_EMAIL,
      subject: `⚡ Nueva venta ${producto}`,
      html: templateAdmin({ nombre, email: emailDst, telefono, producto, precio, referencia }),
    });
    console.log("✅ Email admin enviado");

  } catch (err) {
    console.error("❌ ERROR WEBHOOK:", err.message);
    console.error(err);
  }

  return res.sendStatus(200);
});

// ── HEALTH ──
app.get("/api/health", (req, res) => {
  res.json({
    status:   "ok",
    tienda:   "Flash Tech ARG",
    mp:       process.env.MP_ACCESS_TOKEN ? "✅ OK" : "⚠️ Falta MP_ACCESS_TOKEN",
    email:    GMAIL_USER                  ? "✅ OK" : "⚠️ Falta GMAIL_USER",
    password: GMAIL_APP_PASSWORD          ? "✅ OK" : "⚠️ Falta GMAIL_APP_PASSWORD",
    firebase: FIREBASE_PROJECT_ID         ? "✅ OK" : "⚠️ Falta FIREBASE_PROJECT_ID",
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Flash Tech ARG en http://localhost:${PORT}`));
module.exports = app;
