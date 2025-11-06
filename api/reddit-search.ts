import type { VercelRequest, VercelResponse } from "@vercel/node"

const TOKEN_ENDPOINT = "https://www.reddit.com/api/v1/access_token"
const SEARCH_ENDPOINT = "https://oauth.reddit.com/search"
const USER_AGENT = "echothread-proxy/1.0 (by /u/echothread-app)"

async function getAccessToken() {
  const clientId = process.env.REDDIT_CLIENT_ID
  const clientSecret = process.env.REDDIT_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error("Missing Reddit credentials. Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET.")
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Reddit token request failed (${response.status}): ${body}`)
  }

  const payload = (await response.json()) as { access_token?: string }
  if (!payload.access_token) {
    throw new Error("No access token returned from Reddit.")
  }

  return payload.access_token
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET")
    return res.status(405).json({ error: "Method Not Allowed" })
  }

  const query = (req.query.q || req.query.query) as string | undefined
  if (!query) {
    return res.status(400).json({ error: "Missing query parameter (?q=...)" })
  }

  try {
    const token = await getAccessToken()

    const searchParams = new URLSearchParams({
      q: query,
      limit: "25",
      sort: "new",
      type: "link",
      raw_json: "1",
    })

    const response = await fetch(`${SEARCH_ENDPOINT}?${searchParams.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": USER_AGENT,
      },
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Reddit search failed (${response.status}): ${body}`)
    }

    const payload = await response.json()

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300")
    return res.status(200).json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Reddit proxy error"
    console.error("[Reddit proxy]", message)
    return res.status(500).json({ error: message })
  }
}
