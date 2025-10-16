export default async function handler(req, res) {
  const fetch = (await import("node-fetch")).default;

  const response = await fetch("https://www.zohoapis.com/books/v3/invoices?organization_id=822181064", {
    headers: {
      "Authorization": "Zoho-oauthtoken 1000.1a0d892a6f6a30ead3f57c1a943637aa.33213692e6ee33776449a5de98b2b2f0",
      "X-com-zoho-organizationid": "822181064",
      "Content-Type": "application/json"
    }
  });

  const data = await response.json();
  res.status(200).json(data);
}


