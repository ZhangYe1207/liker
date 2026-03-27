import { corsHeaders, handleCors } from '../_shared/cors.ts'

const IGDB_CLIENT_ID = Deno.env.get('IGDB_CLIENT_ID') ?? ''
const IGDB_CLIENT_SECRET = Deno.env.get('IGDB_CLIENT_SECRET') ?? ''

let cachedToken: { access_token: string; expires_at: number } | null = null

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires_at) {
    return cachedToken.access_token
  }

  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${IGDB_CLIENT_ID}&client_secret=${IGDB_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: 'POST' },
  )
  const data = await res.json()
  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  }
  return data.access_token
}

Deno.serve(async (req) => {
  const corsResp = handleCors(req)
  if (corsResp) return corsResp

  try {
    if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
      return new Response(
        JSON.stringify({ error: 'IGDB credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { query, limit = 10 } = await req.json()
    if (!query) {
      return new Response(
        JSON.stringify({ error: 'query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const token = await getToken()
    const body = `search "${query}"; fields name,summary,cover.url,first_release_date,genres.name; limit ${limit};`

    const igdbRes = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': IGDB_CLIENT_ID,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/plain',
      },
      body,
    })

    const games = await igdbRes.json()

    const results = (games as any[]).map((g) => ({
      externalId: String(g.id),
      title: g.name,
      description: g.summary ?? '',
      coverUrl: g.cover?.url ? `https:${g.cover.url.replace('t_thumb', 't_cover_big')}` : undefined,
      year: g.first_release_date
        ? new Date(g.first_release_date * 1000).getFullYear().toString()
        : undefined,
      genre: g.genres?.map((gen: any) => gen.name).slice(0, 3).join(', ') ?? undefined,
      source: 'igdb',
    }))

    return new Response(
      JSON.stringify({ data: results }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
        },
      },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
