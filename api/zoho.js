let cachedToken = null;
let tokenExpiration = 0;

export default async function handler(req, res) {
  const fetch = (await import("node-fetch")).default;

  // 🔧 Configuración (usa variables de entorno seguras en Vercel)
  const client_id = process.env.ZOHO_CLIENT_ID || "1000.X6UCOBBOSTCDOKO5VB1OJMQTLTDM3N";
  const client_secret = process.env.ZOHO_CLIENT_SECRET || "3b8917fe9f770011f5bca81a9fb90f370d1df9cce6";
  const refresh_token = process.env.ZOHO_REFRESH_TOKEN || "1000.0778e3dd50843a6cdf6db0d997030c1a.c7fc2e17e9e16622d584658ce07fc4a5";
  const organization_id = process.env.ZOHO_ORG_ID || "822181064";

  const module = req.query.module || "Invoices";

  try {
    // 1️⃣ Obtener o renovar token
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
      tokenExpiration = now + 55 * 60 * 1000; // renovar cada 55 min
    }

    const access_token = cachedToken;

    // 2️⃣ Endpoints de Zoho
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

    // 3️⃣ Descarga con paginación
    let allData = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 100) {
      const apiUrl = `https://www.zohoapis.com/books/v3/${endpoint}?organization_id=${organization_id}&page=${page}&per_page=200`;

      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Zoho-oauthtoken ${access_token}`,
          "X-com-zoho-organizationid": organization_id,
          "Content-Type": "application/json",
        },
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        console.error("⚠️ Respuesta no JSON:", text.slice(0, 200));
        return res.status(500).json({ error: "Respuesta no válida desde Zoho", raw: text.slice(0, 200) });
      }

      const arrayKey = Object.keys(data).find(k => Array.isArray(data[k]));
      if (!arrayKey) break;

      allData = [...allData, ...data[arrayKey]];
      hasMore = data.page_context?.has_more_page === true;
      page++;
    }

    // 4️⃣ Si es un módulo de line items, expandirlos (tabla plana)
    if (module.endsWith("LineItems")) {
      const expanded = allData.flatMap(doc =>
        (doc.line_items || []).map(line => ({
          parent_id: doc.bill_id || doc.invoice_id || doc.salesorder_id || doc.purchaseorder_id,
          parent_number: doc.bill_number || doc.invoice_number || doc.salesorder_number || doc.purchaseorder_number,
          parent_date: doc.date || doc.created_time,
          customer_name: doc.customer_name || doc.vendor_name,
          line_item_id: line.line_item_id,
          item_id: line.item_id,
          item_name: line.name,
          description: line.description,
          quantity: line.quantity,
          rate: line.rate,
          discount: line.discount,
          tax_name: line.tax_name,
          tax_percentage: line.tax_percentage,
          total: line.item_total,
        }))
      );

      return res.status(200).json(expanded);
    }

    // 5️⃣ Si no es line items, devolver tabla directa
    return res.status(200).json(allData);
  } catch (error) {
    console.error("💥 Error interno:", error);
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
}
