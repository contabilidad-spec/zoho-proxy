let cachedToken = null;
let tokenExpiration = 0;

export default async function handler(req, res) {
  const fetch = (await import("node-fetch")).default;

  // 🔧 Configuración (puedes mover esto a variables de entorno en Vercel)
  const client_id = "1000.X6UCOBBOSTCDOKO5VB1OJMQTLTDM3N";
  const client_secret = "3b8917fe9f770011f5bca81a9fb90f370d1df9cce6";
  const refresh_token = "1000.ef4e86641983c44738b752fa1e4041fe.2c31bebe025ae1a136234719c37c8533";
  const organization_id = "822181064";

  // ⚙️ Permitir elegir módulo vía query: ?module=invoices (por defecto)
  const module = req.query.module || "invoices";

  try {
    // 1️⃣ Obtener o reutilizar el access_token
    const now = Date.now();
    if (!cachedToken || now > tokenExpiration) {
      console.log("🔑 Solicitando nuevo access_token...");
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

      cachedToken = tokenData.access_token;
      tokenExpiration = now + 55 * 60 * 1000; // válido por 55 minutos
    }

    const access_token = cachedToken;

    // 2️⃣ Lógica de paginación automática
    let allData = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const apiUrl = `https://www.zohoapis.com/books/v3/${module}?organization_id=${organization_id}&page=${page}&per_page=200`;

      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Zoho-oauthtoken ${access_token}`,
          "X-com-zoho-organizationid": organization_id,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (!data[module]) {
        // Algunos módulos tienen nombre diferente al plural
        const possibleKey = Object.keys(data).find(k => Array.isArray(data[k]));
        if (possibleKey) {
          allData = [...allData, ...data[possibleKey]];
        } else {
          console.log("⚠️ No se encontraron datos en el módulo:", module);
          break;
        }
      } else {
        allData = [...allData, ...data[module]];
      }

      hasMore = data.page_context?.has_more_page || false;
      page++;
    }

    // 3️⃣ Devolver todos los datos
    return res.status(200).json({
      module,
      count: allData.length,
      data: allData,
    });
  } catch (error) {
    console.error("❌ Error en el proxy de Zoho:", error);
    return res.status(500).json({ error: error.message });
  }
}





