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
const GMAIL_USER          = process.env.GMAIL_USER;          // tu-email@gmail.com
const GMAIL_APP_PASSWORD  = process.env.GMAIL_APP_PASSWORD;  // contraseña de aplicación de Google
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

// ── Guardar pedido en Firestore (REST API, sin SDK) ──
async function guardarPedido(preferenceId, datos) {
  if (!FIREBASE_PROJECT_ID || !FIREBASE_API_KEY) return;
  try {
    console.log("💾 Guardando pedido. ID:", preferenceId, "| email:", datos.email, "| nombre:", datos.nombre);
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/pedidos/${preferenceId}?key=${FIREBASE_API_KEY}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          nombre:       { stringValue: datos.nombre    || "" },
          email:        { stringValue: datos.email     || "" },
          telefono:     { stringValue: datos.tel       || "" },
          producto:     { stringValue: datos.producto  || "" },
          precioUSD:    { stringValue: String(datos.precioUSD || 0) },
          createdAt:    { stringValue: new Date().toISOString() },
          emailEnviado: { booleanValue: false },
        },
      }),
    });
    if (!res.ok) {
      const errorBody = await res.text();
      console.error("❌ Firestore rechazó el pedido. Status:", res.status, "| Error:", errorBody);
    } else {
      console.log("✅ Pedido guardado OK en Firestore:", preferenceId);
    }
  } catch (err) {
    console.error("Error guardando pedido:", err);
  }
}

// ── Deduplicación atómica por payment.id ──
// Intenta crear el documento. Si ya existe (HTTP 409) → ya fue procesado → devuelve false.
// Firestore garantiza atomicidad: solo una escritura gana aunque lleguen 2 webhooks a la vez.
async function registrarPagoUnico(paymentId) {
  if (!FIREBASE_PROJECT_ID || !FIREBASE_API_KEY || !paymentId) return true; // sin Firebase, dejar pasar
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/pagos_procesados?documentId=${paymentId}&key=${FIREBASE_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { procesadoEn: { stringValue: new Date().toISOString() } } }),
    });
    if (res.status === 409) {
      console.log("⏩ Payment", paymentId, "ya procesado (409) — ignorando duplicado");
      return false; // ya existe, no procesar
    }
    console.log("🔑 Payment", paymentId, "registrado como nuevo");
    return true; // nuevo, procesar
  } catch (err) {
    console.error("Error en registrarPagoUnico:", err);
    return true; // ante error, dejar pasar para no perder ventas
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
      nombre:       data.fields.nombre?.stringValue       || "",
      email:        data.fields.email?.stringValue        || "",
      telefono:     data.fields.telefono?.stringValue     || "",
      producto:     data.fields.producto?.stringValue     || "",
      precioUSD:    Number(data.fields.precioUSD?.stringValue || data.fields.precioUSD?.integerValue || 0),
      emailEnviado: data.fields.emailEnviado?.booleanValue ?? false,
    };
  } catch (err) {
    console.error("Error leyendo pedido:", err);
    return null;
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
  const fecha = new Date().toLocaleDateString("es-AR", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Cordoba",
  });
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Compra confirmada — Flash Tech ARG</title></head>
<body style="margin:0;padding:0;background:#F0F2F5;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F2F5;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10);">

  <!-- HEADER -->
  <tr><td style="background:#0A0A0A;padding:24px 32px;text-align:center;">
    <p style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:1px;">
      Flash<span style="color:#7FFF00;">Tech</span> ARG
    </p>
    <p style="margin:6px 0 0;font-size:10px;color:#888;letter-spacing:3px;text-transform:uppercase;">APPLE STORE · CÓRDOBA</p>
  </td></tr>

  <!-- BANNER CONFIRMADO -->
  <tr><td style="background:#7FFF00;padding:11px 32px;text-align:center;">
    <p style="margin:0;font-size:12px;font-weight:700;color:#0A0A0A;letter-spacing:2px;text-transform:uppercase;">
      ✓ &nbsp;PAGO CONFIRMADO EXITOSAMENTE
    </p>
  </td></tr>

  <!-- CUERPO -->
  <tr><td style="background:#ffffff;padding:32px;">

    <p style="margin:0 0 6px;font-size:18px;font-weight:600;color:#0A0A0A;">¡Hola, ${nombre}!</p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555555;">
      Recibimos tu pago correctamente. Nuestro equipo te va a contactar
      en menos de <strong style="color:#0A0A0A;">1 hora</strong> para coordinar la entrega.
    </p>

    <!-- Detalle del pedido -->
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#FAFAFA;border:1px solid #E8E8E8;border-radius:8px;margin-bottom:20px;overflow:hidden;">
      <tr><td style="padding:12px 16px;border-bottom:1px solid #E8E8E8;">
        <p style="margin:0;font-size:10px;font-weight:700;color:#5EC600;letter-spacing:2px;text-transform:uppercase;">DETALLE DEL PEDIDO</p>
      </td></tr>
      <tr><td style="padding:16px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:13px;color:#888;padding:6px 0;border-bottom:1px solid #F5F5F5;">Producto</td>
            <td style="font-size:13px;font-weight:600;color:#0A0A0A;text-align:right;padding:6px 0;border-bottom:1px solid #F5F5F5;">${producto}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#888;padding:6px 0;border-bottom:1px solid #F5F5F5;">Total pagado</td>
            <td style="font-size:20px;font-weight:700;color:#3D9900;text-align:right;padding:6px 0;border-bottom:1px solid #F5F5F5;">USD ${precio}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#888;padding:6px 0;border-bottom:1px solid #F5F5F5;">Fecha</td>
            <td style="font-size:13px;color:#555;text-align:right;padding:6px 0;border-bottom:1px solid #F5F5F5;">${fecha}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#888;padding:6px 0;">N° referencia</td>
            <td style="font-size:11px;color:#999;text-align:right;padding:6px 0;font-family:monospace;">${referencia}</td>
          </tr>
        </table>
      </td></tr>
    </table>

    <!-- Próximos pasos -->
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#F6FFF0;border:1px solid #D4EFC0;border-radius:8px;margin-bottom:24px;overflow:hidden;">
      <tr><td style="padding:12px 16px;border-bottom:1px solid #D4EFC0;">
        <p style="margin:0;font-size:10px;font-weight:700;color:#3D7A00;letter-spacing:2px;text-transform:uppercase;">¿QUÉ PASA AHORA?</p>
      </td></tr>
      <tr><td style="padding:16px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="28" valign="top" style="font-size:16px;padding:5px 0;">⚡</td>
            <td style="font-size:13px;line-height:1.5;color:#0A0A0A;padding:5px 0;">
              <strong>En menos de 1 hora</strong> te contactamos por WhatsApp al número que registraste.
            </td>
          </tr>
          <tr>
            <td width="28" valign="top" style="font-size:16px;padding:5px 0;">📦</td>
            <td style="font-size:13px;line-height:1.5;color:#0A0A0A;padding:5px 0;">
              <strong>Entrega en Córdoba Capital</strong> el mismo día. Acordamos horario y punto de encuentro.
            </td>
          </tr>
          <tr>
            <td width="28" valign="top" style="font-size:16px;padding:5px 0;">🚚</td>
            <td style="font-size:13px;line-height:1.5;color:#0A0A0A;padding:5px 0;">
              <strong>Envíos al interior</strong> del país coordinados por correo o moto.
            </td>
          </tr>
        </table>
      </td></tr>
    </table>

    <!-- CTA WhatsApp -->
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <a href="https://wa.me/5493512020116"
        style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;
          padding:13px 32px;border-radius:8px;font-size:13px;font-weight:700;">
        💬 &nbsp;Escribinos por WhatsApp
      </a>
    </td></tr></table>

  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#F8F8F8;border-top:1px solid #E8E8E8;padding:18px 32px;text-align:center;">
    <p style="margin:0 0 3px;font-size:11px;color:#999;">Flash Tech ARG · Córdoba Capital, Argentina</p>
    <p style="margin:0;font-size:11px;color:#999;">📱 351 2020116 &nbsp;·&nbsp; 📸 @flashtech.arg</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

// ── Template ADMIN ──
function templateAdmin({ nombre, email, telefono, producto, precio, referencia }) {
  const fecha = new Date().toLocaleDateString("es-AR", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Cordoba",
  });
  const waLink = `https://wa.me/549${(telefono || "").replace(/\D/g, "")}`;
  const mailLink = `mailto:${email}`;
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Nueva venta — Flash Tech ARG</title></head>
<body style="margin:0;padding:0;background:#F0F2F5;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F2F5;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10);">

  <!-- HEADER -->
  <tr><td style="background:#0A0A0A;padding:18px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>
        <p style="margin:0;font-size:16px;font-weight:700;color:#fff;letter-spacing:1px;">
          Flash<span style="color:#7FFF00;">Tech</span> ARG
        </p>
        <p style="margin:3px 0 0;font-size:10px;color:#888;letter-spacing:2px;text-transform:uppercase;">PANEL DE VENTAS</p>
      </td>
      <td align="right">
        <span style="display:inline-block;background:#7FFF00;color:#0A0A0A;font-size:10px;font-weight:700;
          padding:5px 13px;border-radius:20px;letter-spacing:1px;white-space:nowrap;">⚡ NUEVA VENTA</span>
      </td>
    </tr></table>
  </td></tr>

  <!-- CUERPO -->
  <tr><td style="background:#ffffff;padding:28px;">

    <!-- Producto vendido -->
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#F6FFF0;border:1px solid #C8E8A0;border-radius:8px;margin-bottom:20px;">
      <tr><td style="padding:16px;">
        <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#3D7A00;letter-spacing:2px;text-transform:uppercase;">PRODUCTO VENDIDO</p>
        <p style="margin:0;font-size:18px;font-weight:700;color:#0A0A0A;">${producto}</p>
        <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#3D9900;">USD ${precio}</p>
      </td></tr>
    </table>

    <!-- Label comprador -->
    <p style="margin:0 0 10px;font-size:10px;font-weight:700;color:#888;letter-spacing:2px;text-transform:uppercase;">DATOS DEL COMPRADOR</p>

    <!-- Tabla datos -->
    <table width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid #E8E8E8;border-radius:8px;overflow:hidden;margin-bottom:20px;">
      <tr style="border-bottom:1px solid #F0F0F0;">
        <td width="38%" style="padding:11px 14px;background:#FAFAFA;">
          <p style="margin:0;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;">Nombre</p>
        </td>
        <td style="padding:11px 14px;">
          <p style="margin:0;font-size:13px;font-weight:600;color:#0A0A0A;">${nombre}</p>
        </td>
      </tr>
      <tr style="border-bottom:1px solid #F0F0F0;">
        <td width="38%" style="padding:11px 14px;background:#FAFAFA;">
          <p style="margin:0;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;">Email</p>
        </td>
        <td style="padding:11px 14px;">
          <a href="${mailLink}" style="font-size:13px;color:#0066CC;text-decoration:none;">${email}</a>
        </td>
      </tr>
      <tr style="border-bottom:1px solid #F0F0F0;">
        <td width="38%" style="padding:11px 14px;background:#FAFAFA;">
          <p style="margin:0;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;">Teléfono</p>
        </td>
        <td style="padding:11px 14px;">
          <p style="margin:0;font-size:13px;color:#0A0A0A;">${telefono || "No ingresado"}</p>
        </td>
      </tr>
      <tr style="border-bottom:1px solid #F0F0F0;">
        <td width="38%" style="padding:11px 14px;background:#FAFAFA;">
          <p style="margin:0;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;">Fecha y hora</p>
        </td>
        <td style="padding:11px 14px;">
          <p style="margin:0;font-size:13px;color:#0A0A0A;">${fecha}</p>
        </td>
      </tr>
      <tr>
        <td width="38%" style="padding:11px 14px;background:#FAFAFA;">
          <p style="margin:0;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;">Referencia MP</p>
        </td>
        <td style="padding:11px 14px;">
          <p style="margin:0;font-size:11px;color:#999;font-family:monospace;">${referencia}</p>
        </td>
      </tr>
    </table>

    <!-- Acciones rápidas -->
    <p style="margin:0 0 10px;font-size:10px;font-weight:700;color:#888;letter-spacing:2px;text-transform:uppercase;">ACCIONES RÁPIDAS</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="49%" style="padding-right:5px;">
        <a href="${waLink}"
          style="display:block;text-align:center;background:#25D366;color:#ffffff;text-decoration:none;
            padding:12px;border-radius:8px;font-size:12px;font-weight:700;">
          💬 WhatsApp al cliente
        </a>
      </td>
      <td width="49%" style="padding-left:5px;">
        <a href="${mailLink}"
          style="display:block;text-align:center;background:#0A0A0A;color:#ffffff;text-decoration:none;
            padding:12px;border-radius:8px;font-size:12px;font-weight:700;">
          ✉️ Responder por email
        </a>
      </td>
    </tr></table>

  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#F8F8F8;border-top:1px solid #E8E8E8;padding:16px 28px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#BBB;">Flash Tech ARG · Panel interno · No reenviar</p>
  </td></tr>

</table>
</td></tr></table>
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

    console.log("📦 Comprador recibido en /crear-pago:", JSON.stringify(comprador));

    // Guardar bajo AMBAS claves: preference.id y external_reference
    // El webhook puede recibir cualquiera de las dos dependiendo de la version de MP
    if (comprador && result.id) {
      const datosPedido = {
        ...comprador,
        producto,
        precioUSD: Math.round(Number(precio) / 1200),
      };
      await guardarPedido(result.id, datosPedido);
      await guardarPedido(body.external_reference, datosPedido);
      console.log('✅ Pedido guardado bajo:', result.id, 'y', body.external_reference);
    }

    res.json({ id: result.id, init_point: result.init_point });
  } catch (error) {
    console.error("Error MP:", error);
    res.status(500).json({ error: error.message });
  }
});

// ── SIMULAR COMPRA (ADMIN) ──
app.post("/api/simular-compra", async (req, res) => {
  try {
    const {
      nombre,
      email,
      telefono,
      producto,
      precioUSD
    } = req.body;

    if (!nombre || !email || !producto || !precioUSD) {
      return res.status(400).json({
        error: "Faltan datos"
      });
    }

    // Referencia fake estilo MP
    const referencia = `ADMIN-${Date.now()}`;

    // Guardar pedido en Firestore
    await guardarPedido(referencia, {
      nombre,
      email,
      tel: telefono || "",
      producto,
      precioUSD
    });

    console.log("🧪 Compra simulada:", referencia);

    // EMAIL CLIENTE
    await enviarEmail({
      to: email,
      subject: "✅ Compra confirmada — Flash Tech ARG",
      html: templateCliente({
        nombre,
        producto,
        precio: precioUSD,
        referencia
      }),
    });

    console.log("✅ Email cliente enviado");

    // EMAIL ADMIN
    await enviarEmail({
      to: ADMIN_EMAIL,
      subject: `🧪 Venta simulada ${producto}`,
      html: templateAdmin({
        nombre,
        email,
        telefono,
        producto,
        precio: precioUSD,
        referencia
      }),
    });

    console.log("✅ Email admin enviado");

    res.json({
      ok: true,
      referencia
    });

  } catch (err) {
    console.error("❌ ERROR SIMULANDO COMPRA:", err);
    res.status(500).json({
      error: err.message
    });
  }
});

// ── WEBHOOK ──
app.post("/api/webhook", async (req, res) => {
  console.log("📩 WEBHOOK RECIBIDO");
  console.log("BODY:", JSON.stringify(req.body));
  console.log("QUERY:", JSON.stringify(req.query));

  // MercadoPago v1 (WebHook)  → body.type  + body.data.id
  // MercadoPago v2 (Feed)     → query.topic + query.id
  const type   = req.body.type  || req.body.topic  || req.query.type  || req.query.topic;
  const dataId = req.body.data?.id || req.query["data.id"] || req.query.id || req.body.id;

  console.log("TIPO:", type);
  console.log("DATA ID:", dataId);

  try {
    if (type !== "payment" || !dataId) {
      console.log("❌ Evento ignorado — tipo:", type, "| id:", dataId);
      return res.sendStatus(200);
    }

    console.log("🔍 Consultando pago en MP:", dataId);
    const pago = await payment.get({ id: dataId });

    // preference_id puede venir undefined en Feed v2, usar external_reference como fallback
    const prefId = pago.preference_id || pago.external_reference;
    console.log("💳 Status:", pago.status, "| prefId:", prefId);

    if (pago.status !== "approved") {
      console.log("⏳ Pago no aprobado, status:", pago.status);
      return res.sendStatus(200);
    }

    // Recuperar datos del comprador desde Firestore
    // Intentar con preference_id primero, luego con external_reference como fallback
    let comprador = await leerPedido(prefId);
    if (!comprador && pago.external_reference && pago.external_reference !== prefId) {
      console.log("🔄 Reintentando con external_reference:", pago.external_reference);
      comprador = await leerPedido(pago.external_reference);
    }
    if (!comprador && pago.preference_id && pago.preference_id !== prefId) {
      console.log("🔄 Reintentando con preference_id:", pago.preference_id);
      comprador = await leerPedido(pago.preference_id);
    }
    console.log("👤 Comprador Firestore:", JSON.stringify(comprador));
    console.log("🔑 prefId usado:", prefId);
    console.log("🔑 external_reference del pago:", pago.external_reference);
    console.log("🔑 preference_id del pago:", pago.preference_id);

    // ── FIX 1: usar external_reference del pago como referencia legible ──
    // Antes: `FT-${pago.id}` usaba el ID numérico interno de MP
    const referencia = pago.external_reference || `FT-${pago.id}`;

    const nombre     = comprador?.nombre    || pago.payer?.first_name || "Cliente";
    // ── FIX 2: NUNCA usar pago.payer.email — es el email de la cuenta MP del pagador,
    //    no el email que el cliente escribió en el formulario ──
    const emailDst   = comprador?.email     || "";
    const telefono   = comprador?.telefono  || "";
    const producto   = comprador?.producto  || "Producto Apple";
    const precio     = comprador?.precioUSD || Math.round(pago.transaction_amount / 1200);

    if (!comprador) {
      console.warn("⚠️ No se encontró el pedido en Firestore — los datos del admin estarán incompletos");
    }

    console.log("📧 Destinatario cliente:", emailDst);

    // Deduplicación atómica: registrar el payment.id en Firestore
    // Si ya existe (otro webhook lo registró antes) → ignorar
    const esNuevo = await registrarPagoUnico(String(pago.id));
    if (!esNuevo) return res.sendStatus(200);

    // Email al cliente
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

    // Email al admin
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

  // 200 al final para que Vercel no corte la ejecución async
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
