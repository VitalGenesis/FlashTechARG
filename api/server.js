const express = require("express");
const cors = require("cors");
const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ── MercadoPago ──
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || "TU_ACCESS_TOKEN",
});

const preference = new Preference(client);
const payment = new Payment(client);

// ── Resend (emails) ──
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "valentingonzalezescritorio@gmail.com";
const BASE_URL = process.env.BASE_URL || "https://flash-tech-arg.vercel.app";

// Función para enviar emails con Resend
async function enviarEmail({ to, subject, html }) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Flash Tech ARG <onboarding@resend.dev>",
        to,
        subject,
        html,
      }),
    });
    const data = await res.json();
    console.log("Email enviado:", data);
    return data;
  } catch (err) {
    console.error("Error enviando email:", err);
  }
}

// ── Email de comprobante para el CLIENTE ──
function emailCliente({ nombre, producto, precio, referencia }) {
  return `
  <!DOCTYPE html>
  <html lang="es">
  <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f4f4f4;font-family:'Segoe UI',Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
      <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#0a0a0a;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
          
          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#0d2200,#0a0a0a);padding:36px 40px;text-align:center;border-bottom:3px solid #7fff00;">
              <div style="font-family:'Segoe UI',Arial,sans-serif;font-size:28px;font-weight:900;text-transform:uppercase;letter-spacing:-1px;">
                <span style="color:#ffffff;">Flash</span><span style="color:#7fff00;">Tech</span> <span style="color:#ffffff;">ARG</span>
              </div>
              <div style="color:#888;font-size:13px;margin-top:4px;letter-spacing:2px;text-transform:uppercase;">Apple Store · Córdoba</div>
            </td>
          </tr>

          <!-- COMPROBANTE BADGE -->
          <tr>
            <td style="background:#7fff00;padding:14px 40px;text-align:center;">
              <span style="color:#000;font-weight:800;font-size:14px;letter-spacing:2px;text-transform:uppercase;">✅ PAGO CONFIRMADO</span>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:40px;">
              <p style="color:#c8c8c8;font-size:16px;margin:0 0 24px;">Hola <strong style="color:#fff;">${nombre}</strong>,</p>
              <p style="color:#c8c8c8;font-size:15px;line-height:1.6;margin:0 0 32px;">
                Tu pago fue procesado exitosamente. En breve nos ponemos en contacto para coordinar la entrega de tu equipo.
              </p>

              <!-- DETALLE DEL PEDIDO -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid rgba(127,255,0,0.2);border-radius:4px;margin-bottom:32px;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <span style="color:#7fff00;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Detalle del pedido</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;">
                    <table width="100%">
                      <tr>
                        <td style="color:#888;font-size:13px;padding-bottom:12px;">Producto</td>
                        <td style="color:#fff;font-size:13px;font-weight:700;text-align:right;padding-bottom:12px;">${producto}</td>
                      </tr>
                      <tr>
                        <td style="color:#888;font-size:13px;padding-bottom:12px;">Total pagado</td>
                        <td style="color:#7fff00;font-size:18px;font-weight:900;text-align:right;padding-bottom:12px;">USD ${precio}</td>
                      </tr>
                      <tr>
                        <td style="color:#888;font-size:13px;">N° de referencia</td>
                        <td style="color:#c8c8c8;font-size:12px;text-align:right;font-family:monospace;">${referencia}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- PRÓXIMOS PASOS -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid rgba(127,255,0,0.15);border-radius:4px;margin-bottom:32px;">
                <tr><td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
                  <span style="color:#7fff00;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">¿Qué sigue?</span>
                </td></tr>
                <tr><td style="padding:20px;">
                  <p style="color:#c8c8c8;font-size:14px;margin:0 0 10px;">⚡ <strong style="color:#fff;">En menos de 1 hora</strong> te contactamos por WhatsApp para coordinar la entrega.</p>
                  <p style="color:#c8c8c8;font-size:14px;margin:0 0 10px;">📦 <strong style="color:#fff;">Entrega en Córdoba Capital</strong> el mismo día.</p>
                  <p style="color:#c8c8c8;font-size:14px;margin:0;">🚚 <strong style="color:#fff;">Envíos al interior</strong> coordinados por correo.</p>
                </td></tr>
              </table>

              <!-- CONTACTO -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://wa.me/5493512020116" style="display:inline-block;background:#25D366;color:#fff;padding:14px 32px;font-weight:800;font-size:14px;letter-spacing:1px;text-transform:uppercase;text-decoration:none;border-radius:3px;">
                      💬 Escribinos por WhatsApp
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#050505;padding:24px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="color:#555;font-size:12px;margin:0 0 6px;">Flash Tech ARG · Córdoba Capital, Argentina</p>
              <p style="color:#555;font-size:12px;margin:0 0 6px;">📱 351 2020116 · 📸 @flashtech.arg</p>
              <p style="color:#333;font-size:11px;margin:0;">Este es un email automático de confirmación de compra.</p>
            </td>
          </tr>

        </table>
      </td></tr>
    </table>
  </body>
  </html>`;
}

// ── Email de notificación para el ADMIN ──
function emailAdmin({ nombre, email, telefono, producto, precio, referencia }) {
  return `
  <!DOCTYPE html>
  <html lang="es">
  <body style="margin:0;padding:20px;background:#f4f4f4;font-family:'Segoe UI',Arial,sans-serif;">
    <table width="100%" style="max-width:500px;margin:0 auto;background:#0a0a0a;border:2px solid #7fff00;border-radius:8px;overflow:hidden;">
      <tr><td style="background:#7fff00;padding:14px 24px;">
        <strong style="color:#000;font-size:16px;">⚡ NUEVA VENTA — Flash Tech ARG</strong>
      </td></tr>
      <tr><td style="padding:24px;">
        <table width="100%">
          <tr><td style="color:#888;font-size:13px;padding:6px 0;">Producto</td><td style="color:#fff;font-weight:700;font-size:13px;">${producto}</td></tr>
          <tr><td style="color:#888;font-size:13px;padding:6px 0;">Precio</td><td style="color:#7fff00;font-weight:900;font-size:16px;">USD ${precio}</td></tr>
          <tr><td colspan="2" style="border-top:1px solid rgba(255,255,255,0.08);padding-top:14px;padding-bottom:6px;color:#7fff00;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Datos del comprador</td></tr>
          <tr><td style="color:#888;font-size:13px;padding:6px 0;">Nombre</td><td style="color:#fff;font-size:13px;">${nombre}</td></tr>
          <tr><td style="color:#888;font-size:13px;padding:6px 0;">Email</td><td style="color:#fff;font-size:13px;">${email}</td></tr>
          <tr><td style="color:#888;font-size:13px;padding:6px 0;">Teléfono</td><td style="color:#fff;font-size:13px;">${telefono || 'No ingresado'}</td></tr>
          <tr><td style="color:#888;font-size:13px;padding:6px 0;">Referencia MP</td><td style="color:#888;font-size:12px;font-family:monospace;">${referencia}</td></tr>
        </table>
        <div style="margin-top:20px;text-align:center;">
          <a href="https://wa.me/549${telefono ? telefono.replace(/\D/g,'') : ''}" 
             style="background:#25D366;color:#fff;padding:10px 24px;font-weight:700;font-size:13px;text-decoration:none;border-radius:3px;display:inline-block;">
            Contactar por WhatsApp →
          </a>
        </div>
      </td></tr>
    </table>
  </body>
  </html>`;
}

// ── CREAR PAGO ──
app.post("/api/crear-pago", async (req, res) => {
  const { producto, precio, cantidad = 1, comprador } = req.body;

  if (!producto || !precio) {
    return res.status(400).json({ error: "Faltan datos del producto" });
  }

  try {
    const body = {
      items: [{
        title: producto,
        quantity: Number(cantidad),
        unit_price: Number(precio),
        currency_id: "ARS",
      }],
      payer: comprador ? {
        name: comprador.nombre,
        email: comprador.email,
        phone: { number: comprador.tel || "" },
      } : {},
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

    // Guardar datos del comprador temporalmente para el webhook
    if (comprador) {
      app.locals.compradores = app.locals.compradores || {};
      app.locals.compradores[result.id] = {
        ...comprador,
        producto,
        precioUSD: Math.round(precio / 1200), // ARS → USD aproximado
        referencia: result.id,
      };
    }

    res.json({
      id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point,
    });
  } catch (error) {
    console.error("Error MP:", error);
    res.status(500).json({ error: "Error al crear el pago", detalle: error.message });
  }
});

// ── WEBHOOK DE MERCADOPAGO ──
app.post("/api/webhook", async (req, res) => {
  const { type, data } = req.body;
  res.sendStatus(200); // Responder rápido a MP

  if (type === "payment" && data?.id) {
    try {
      const pago = await payment.get({ id: data.id });

      if (pago.status === "approved") {
        const preferenceId = pago.preference_id;
        const comprador = (app.locals.compradores || {})[preferenceId];

        const nombre = comprador?.nombre || pago.payer?.first_name || "Cliente";
        const emailCliente_addr = comprador?.email || pago.payer?.email;
        const telefono = comprador?.tel || "";
        const producto = comprador?.producto || pago.description || "Producto";
        const precioUSD = comprador?.precioUSD || Math.round(pago.transaction_amount / 1200);
        const referencia = `FT-${pago.id}`;

        console.log(`✅ Pago aprobado: ${referencia} — ${producto} — ${emailCliente_addr}`);

        // Email al CLIENTE
        if (emailCliente_addr && RESEND_API_KEY) {
          await enviarEmail({
            to: emailCliente_addr,
            subject: `✅ Comprobante de compra — Flash Tech ARG`,
            html: emailCliente({ nombre, producto, precio: precioUSD, referencia }),
          });
        }

        // Email al ADMIN
        if (RESEND_API_KEY) {
          await enviarEmail({
            to: ADMIN_EMAIL,
            subject: `⚡ Nueva venta: ${producto} — USD ${precioUSD}`,
            html: emailAdmin({ nombre, email: emailCliente_addr, telefono, producto, precio: precioUSD, referencia }),
          });
        }
      }
    } catch (err) {
      console.error("Error procesando webhook:", err);
    }
  }
});

// ── HEALTH CHECK ──
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    tienda: "Flash Tech ARG",
    email: RESEND_API_KEY ? "✅ Resend configurado" : "⚠️ RESEND_API_KEY no configurada",
    mp: process.env.MP_ACCESS_TOKEN ? "✅ MercadoPago configurado" : "⚠️ MP_ACCESS_TOKEN no configurada",
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Flash Tech ARG corriendo en http://localhost:${PORT}`);
});

module.exports = app;
