let cachedToken = null;
let tokenExpiration = 0;

export default async function handler(req, res) {
  const fetch = (await import("node-fetch")).default;

  // 🔧 Configuración
  const client_id = process.env.ZOHO_CLIENT_ID || "1000.X6UCOBBOSTCDOKO5VB1OJMQTLTDM3N";
  const client_secret = process.env.ZOHO_CLIENT_SECRET || "3b8917fe9f770011f5bca81a9fb90f370d1df9cce6";
  const refresh_token = process.env.ZOHO_REFRESH_TOKEN || "1000.0778e3dd50843a6cdf6db0d997030c1a.c7fc2e17e9e16622d584658ce07fc4a5";
  const organization_id = process.env.ZOHO_ORG_ID || "822181064";

  const module = req.query.module || "Invoices";

  try {
    // 1️⃣ Obtener o renovar el token automáticamente
    const now = Date.now();
    if (!cachedToken || now > tokenExpiration) {
      console.log("🔑 Renovando token de Zoho...");
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
        console.error("❌ Error al obtener token:", tokenData);
        return res.status(400).json({ error: "No se pudo obtener el access_token", tokenData });
      }

      cachedToken = tokenData.access_token;
      tokenExpiration = now + 55 * 60 * 1000; // Renovar antes de 1 h
    }

    const access_token = cachedToken;

    // 2️⃣ Endpoints principales
    const endpoints = {
      Bills: "bills",
      BillLineItems: "bills",
      Invoices: "invoices",
      InvoiceLineItems: "invoices",
      Items: "items",
      PurchaseOrders: "purchaseorders",
      PurchaseOrderLineItems: "purchaseorders",
      SalesOrders: "salesorders",
      SalesOrderLineItems: "salesorders",
    };

    const endpoint = endpoints[module];
    if (!endpoint) {
      return res.status(400).json({ error: `El módulo '${module}' no está soportado.` });
    }

    // 3️⃣ Descarga paginada de encabezados
    let allData = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 50) {
      const apiUrl = `https://www.zohoapis.com/books/v3/${endpoint}?organization_id=${organization_id}&page=${page}&per_page=200`;

      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Zoho-oauthtoken ${access_token}`,
          "X-com-zoho-organizationid": organization_id,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      const arrayKey = Object.keys(data).find(k => Array.isArray(data[k]));
      if (!arrayKey) break;

      allData = [...allData, ...data[arrayKey]];
      hasMore = data.page_context?.has_more_page === true;
      page++;
    }

    // 4️⃣ Si es módulo LineItems → obtener los ítems detallados
    if (module.endsWith("LineItems")) {
      let allLineItems = [];

      for (const doc of allData) {
        const id =
          doc.bill_id ||
          doc.invoice_id ||
          doc.purchaseorder_id ||
          doc.salesorder_id;

        if (!id) continue;

        const detailUrl = `https://www.zohoapis.com/books/v3/${endpoint}/${id}?organization_id=${organization_id}`;

        const detailResp = await fetch(detailUrl, {
          headers: {
            Authorization: `Zoho-oauthtoken ${access_token}`,
            "X-com-zoho-organizationid": organization_id,
            "Content-Type": "application/json",
          },
        });

        const detailData = await detailResp.json();

        const mainKey = endpoint.slice(0, -1); // e.g. "invoices" -> "invoice"
        const record = detailData[mainKey];
        if (!record?.line_items) continue;

        const lines = record.line_items.map(line => ({
          parent_id: id,
          parent_number:
            record.invoice_number ||
            record.bill_number ||
            record.salesorder_number ||
            record.purchaseorder_number,
          date: record.date || record.created_time,
          customer_name: record.customer_name || record.vendor_name,
          ...line,
        }));

        allLineItems = [...allLineItems, ...lines];
      }

      return res.status(200).json({ module, count: allLineItems.length, data: allLineItems });
    }

    // 5️⃣ Si no son LineItems, devolver encabezados
    return res.status(200).json({ module, count: allData.length, data: allData });
  } catch (error) {
    console.error("💥 Error interno:", error);
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
}
