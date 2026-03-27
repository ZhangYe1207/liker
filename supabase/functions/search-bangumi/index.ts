import { corsHeaders, handleCors } from '../_shared/cors.ts'

const BANGUMI_TOKEN = Deno.env.get('BANGUMI_TOKEN') ?? ''

Deno.serve(async (req) => {
  const corsResp = handleCors(req)
  if (corsResp) return corsResp

  try {
    const { query, type = 2, limit = 10 } = await req.json()
    if (!query) {
      return new Response(
        JSON.stringify({ error: 'query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Liker/1.0 (https://github.com/liker-app)',
    }
    if (BANGUMI_TOKEN) {
      headers['Authorization'] = `Bearer ${BANGUMI_TOKEN}`
    }

    const bangumiRes = await fetch('https://api.bgm.tv/v0/search/subjects', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        keyword: query,
        filter: { type: [type] },
      }),
    })

    if (!bangumiRes.ok) {
      return new Response(
        JSON.stringify({ error: `Bangumi API returned ${bangumiRes.status}` }),
        { status: bangumiRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const data = await bangumiRes.json()
    const items = (data.data ?? []).slice(0, limit)

    const results = items.map((item: any) => ({
      externalId: String(item.id),
      title: item.name_cn || item.name || '',
      description: item.summary ?? '',
      coverUrl: item.images?.common ?? item.images?.medium ?? undefined,
      year: item.date?.match(/(\d{4})/)?.[1] ?? undefined,
      genre: Array.isArray(item.tags)
        ? item.tags.slice(0, 3).map((t: any) => t.name).join(', ')
        : undefined,
      source: 'bangumi',
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
