const express = require("express");
const cors = require("cors");
const { MercadoPagoConfig, Preference } = require("mercadopago");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ── Configurá tu Access Token acá ──
// En Vercel lo ponés como variable de entorno MP_ACCESS_TOKEN
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || "TU_ACCESS_TOKEN_ACÁ",
});

const preference = new Preference(client);

// ── Crear preferencia de pago ──
app.post("/api/crear-pago", async (req, res) => {
  const { producto, precio, cantidad = 1 } = req.body;

  if (!producto || !precio) {
    return res.status(400).json({ error: "Faltan datos del producto" });
  }

  try {
    const baseUrl = process.env.BASE_URL || "https://tu-app.vercel.app";

    const body = {
      items: [
        {
          title: producto,
          quantity: Number(cantidad),
          unit_price: Number(precio),
          currency_id: "ARS",
        },
      ],
      payer: {
        phone: {
          area_code: "351",
          number: "2020116",
        },
      },
      back_urls: {
        success: `${baseUrl}/exito.html`,
        failure: `${baseUrl}/error.html`,
        pending: `${baseUrl}/pendiente.html`,
      },
      auto_return: "approved",
      statement_descriptor: "FLASH TECH ARG",
      external_reference: `FT-${Date.now()}`,
      // Notificación cuando se paga (opcional - necesita URL pública)
      // notification_url: `${baseUrl}/api/webhook`,
    };

    const result = await preference.create({ body });

    res.json({
      id: result.id,
      init_point: result.init_point, // URL de pago producción
      sandbox_init_point: result.sandbox_init_point, // URL de pago prueba
    });
  } catch (error) {
    console.error("Error MP:", error);
    res.status(500).json({ error: "Error al crear el pago", detalle: error.message });
  }
});

// ── Webhook de MercadoPago (notificaciones de pago) ──
app.post("/api/webhook", async (req, res) => {
  const { type, data } = req.body;

  if (type === "payment") {
    const paymentId = data?.id;
    console.log(`✅ Pago recibido: ${paymentId}`);
    // Acá podrías guardar en base de datos, enviar email, etc.
  }

  res.sendStatus(200);
});

// ── Health check ──
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", tienda: "Flash Tech ARG" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Flash Tech ARG corriendo en http://localhost:${PORT}`);
});

module.exports = app;
