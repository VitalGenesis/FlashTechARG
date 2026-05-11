// ── WEBHOOK ──
app.post("/api/webhook", async (req, res) => {

  console.log("📩 WEBHOOK RECIBIDO");

  const type = req.body.type || req.query.topic;
  const data = req.body.data || { id: req.query.id };

  console.log("TIPO:", type);
  console.log("DATA:", data);

  res.sendStatus(200);

  try {

    if (type !== "payment" || !data?.id) {
      console.log("❌ Evento ignorado");
      return;
    }

    const pago = await payment.get({ id: data.id });

    console.log("💳 Pago:", pago.status);

    if (pago.status !== "approved") {
      console.log("⏳ Pago no aprobado");
      return;
    }

    const comprador = await leerPedido(pago.preference_id);

    const referencia = `FT-${pago.id}`;

    const nombre =
      comprador?.nombre ||
      pago.payer?.first_name ||
      "Cliente";

    const emailDst =
      comprador?.email ||
      pago.payer?.email ||
      "";

    const telefono =
      comprador?.telefono ||
      "";

    const producto =
      comprador?.producto ||
      "Producto Apple";

    const precio =
      comprador?.precioUSD ||
      Math.round(pago.transaction_amount / 1200);

    console.log("📧 Enviando emails");

    if (emailDst) {
      await enviarEmail({
        to: emailDst,
        subject: "✅ Compra confirmada — Flash Tech ARG",
        html: templateCliente({
          nombre,
          producto,
          precio,
          referencia,
        }),
      });

      console.log("✅ Cliente OK");
    }

    await enviarEmail({
      to: ADMIN_EMAIL,
      subject: `⚡ Nueva venta ${producto}`,
      html: templateAdmin({
        nombre,
        email: emailDst,
        telefono,
        producto,
        precio,
        referencia,
      }),
    });

    console.log("✅ Admin OK");

  } catch (err) {

    console.error("❌ ERROR WEBHOOK");
    console.error(err);

  }

});
