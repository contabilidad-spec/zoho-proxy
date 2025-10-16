export default async function handler(req, res) {
  const fetch = (await import("node-fetch")).default;

  // 🔧 Configuración (puedes mover esto a variables de entorno en Vercel)
  const client_id = "1000.X6UCOBBOSTCDOKO5VB1OJMQTLTDM3N";
  const client_secret = "3b8917fe9f770011f5bca81a9fb90f370d1df9cce6";
  const refresh_token = "1000.0778e3dd50843a6cdf6db0d997030c1a.c7fc2e17e9e16622d584658ce07fc4a5";
  const organization_id = "822181064";

  try {
    // 1️⃣ Obtener un nuevo access_token usando el refresh_token
    const tokenResponse = await fetch("https://accounts.zoho.com/oauth/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token,
        client_id,
        client_secret,
        grant_type: "refresh_token",
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      return res.status(400).json({ error: "No se pudo obtener el access_token", tokenData });
    }

    const access_token = tokenData.access_token;

    // 2️⃣ Paginación automática para traer todos los datos
    let allInvoices = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const apiUrl = `https://www.zohoapis.com/books/v3/invoices?organization_id=${organization_id}&page=${page}&per_page=200`;

      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Zoho-oauthtoken ${access_token}`,
          "X-com-zoho-organizationid": organization_id,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (!data.invoices) break;

      allInvoices = [...allInvoices, ...data.invoices];
      hasMore = data.page_context?.has_more_page || false;
      page++;
    }

    // 3️⃣ Devolver toda la data unificada
    return res.status(200).json({
      count: allInvoices.length,
      invoices: allInvoices,
    });
  } catch (error) {
    console.error("Error en el proxy de Zoho:", error);
    return res.status(500).json({ error: error.message });
  }
}

