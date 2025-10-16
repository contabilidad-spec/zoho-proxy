export default async function handler(req, res) {
  const fetch = (await import("node-fetch")).default;

  const response = await fetch("https://www.zohoapis.com/books/v3/invoices?organization_id=822181064", {
    headers: {
      "Authorization": "Zoho-oauthtoken {{access_token}}",
      "X-com-zoho-organizationid": "822181064",
      "Content-Type": "application/json"
    }
  });

  const data = await response.json();
  res.status(200).json(data);
}



