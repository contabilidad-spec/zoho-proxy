let cachedToken = null;
let tokenExpiration = 0;

export default async function handler(req, res) {
  const fetch = (await import("node-fetch")).default;

  // 🔧 Configuración — usa variables de entorno en Vercel (recomendado)
  const client_id = process.env.ZOHO_CLIENT_ID || "1000.X6UCOBBOSTCDOKO5VB1OJMQTLTDM3N";
  const client_secret = process.env.ZOHO_CLIENT_SECRET || "3b8917fe9f770011f5bca81a9fb90f370d1df9cce6";
  const refresh_token = process.env.ZOHO_REFRESH_TOKEN || "1000.0778e3dd50843a6cdf6db0d997030c1a.c7fc2e17e9e16622d584658ce07fc4a5";
  const organization_id = process.env.ZOHO_ORG_ID || "822181064";

  const module = (req.query.module || "Invoices").trim();
  const normalizedModule = module.charAt(0).toUpperCase() + module.slice(1).toLowerCase();

  try {
    // 1️⃣ Renovar token automáticamente si expiró
    const now = Date.now();
    if (!cachedToken || now > tokenExpiration) {
      console.log("🔑 Solicitando nuevo token...");
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
      tokenExpiration = now + 55 * 60 * 1000; // Renovar cada 55 minutos
    }

    const access_token = cachedToken;

    // 2️⃣ Mapeo de módulos y endpoints
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

    const endpoint = endpoints[normalizedModule];
    if (!endpoint) {
      return res.status(400).json({ error: `El módulo '${normalizedModule}' no está soportado.` });
    }

    // 3️⃣ Descargar todas las páginas de Zoho
    let allData = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 50) {
      const apiUrl = `https://www.zohoapis.com/books/v3/${endpoint}?organization_id=${organization_id}&page=${page}&per_page=200`;
      console.log(`📄 Descargando página ${page} del módulo ${normalizedModule}...`);

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

    // 4️⃣ Si el módulo es LineItems, traer los detalles uno por uno
    if (normalizedModule.endsWith("LineItems")) {
      const detailedItems = [];
      const singleKeys = {
        bills: "bill",
        invoices: "invoice",
        purchaseorders: "purchaseorder",
        salesorders: "salesorder",
      };

      for (const doc of allData) {
        const id =
          doc.bill_id || doc.invoice_id || doc.salesorder_id || doc.purchaseorder_id;
        if (!id) continue;

        const detailUrl = `https://www.zohoapis.com/books/v3/${endpoint}/${id}?organization_id=${organization_id}`;
        const detailRes = await fetch(detailUrl, {
          headers: {
            Authorization: `Zoho-oauthtoken ${access_token}`,
            "X-com-zoho-organizationid": organization_id,
          },
        });

        const detailData = await detailRes.json();
        const record = detailData[singleKeys[endpoint]] || detailData[endpoint];
        if (record?.line_items) {
          for (const line of record.line_items) {
            detailedItems.push({
              parent_id: id,
              parent_number:
                record.bill_number ||
                record.invoice_number ||
                record.salesorder_number ||
                record.purchaseorder_number,
              date: record.date || record.created_time,
              customer_name: record.customer_name || record.vendor_name,
              ...line,
            });
          }
        }
      }

      return res.status(200).json({
        module: normalizedModule,
        count: detailedItems.length,
        data: detailedItems,
      });
    }

    // 5️⃣ Devolver datos normales si no son line items
    return res.status(200).json({ module: normalizedModule, count: allData.length, data: allData });

  } catch (error) {
    console.error("💥 Error interno:", error);
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
}
