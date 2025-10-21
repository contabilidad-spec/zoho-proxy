let cachedToken = null;
let tokenExpiration = 0;

export default async function handler(req, res) {
  const fetch = (await import("node-fetch")).default;

  // 🔧 Configuración
  const client_id = "1000.X6UCOBBOSTCDOKO5VB1OJMQTLTDM3N";
  const client_secret = "3b8917fe9f770011f5bca81a9fb90f370d1df9cce6";
  const refresh_token = {{access_token}};
  const organization_id = "822181064";

  const module = req.query.module || "invoices";

  try {
    // 1️⃣ Token: renovar solo si expira
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
      tokenExpiration = now + 55 * 60 * 1000;
    }

    const access_token = cachedToken;

    // 2️⃣ Endpoints Zoho
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

    // 3️⃣ Paginación
    let allData = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const apiUrl = `https://www.zohoapis.com/books/v3/${endpoint}?organization_id=${organization_id}&page=${page}&per_page=200`;

      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Zoho-oauthtoken ${access_token}`,
          "X-com-zoho-organizationid": organization_id,
          "Content-Type": "application/json",
        },
      });

      const text = await response.text();

      // Validar que la respuesta sea JSON
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        console.error("⚠️ Respuesta no JSON recibida:", text.slice(0, 200));
        return res.status(500).json({ error: "Respuesta no válida desde Zoho", raw: text.slice(0, 200) });
      }

      const arrayKey = Object.keys(data).find(k => Array.isArray(data[k]));
      if (!arrayKey) {
        console.log("⚠️ No se encontraron datos válidos en la respuesta:", data);
        break;
      }

      allData = [...allData, ...data[arrayKey]];
      hasMore = data.page_context?.has_more_page || false;
      page++;
    }

    // 4️⃣ Si son line items, expandirlos
    if (module.endsWith("LineItems")) {
      const expanded = allData.flatMap(doc => {
        if (!doc.line_items) return [];
        return doc.line_items.map(line => ({
          parent_id: doc.bill_id || doc.invoice_id || doc.salesorder_id || doc.purchaseorder_id,
          parent_number: doc.bill_number || doc.invoice_number || doc.salesorder_number || doc.purchaseorder_number,
          date: doc.date || doc.created_time,
          customer_name: doc.customer_name || doc.vendor_name,
          ...line,
        }));
      });

      return res.status(200).json({ module, count: expanded.length, data: expanded });
    }

    return res.status(200).json({ module, count: allData.length, data: allData });
  } catch (error) {
    console.error("💥 Error interno:", error);
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
}




