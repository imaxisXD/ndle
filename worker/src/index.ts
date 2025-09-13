import { Hono } from 'hono'

type Bindings = {
  UPSTASH_REDIS_REST_TOKEN: string
  UPSTASH_REDIS_REST_URL: string
}

const app = new Hono<{ Bindings: Bindings }>()

function makeCacheKeyFromContext(c: any): string {
  const url = new URL(c.req.url)
  const origin = url.origin.toLowerCase()
  let pathname = url.pathname.replace(/\/+$/, '') || '/'
  return `${origin}${pathname}`
}

app.get(
  '/:websiteSlug',
  async (c) => {
    const slug = c.req.param('websiteSlug')
    if (!slug) return c.text('Not found', 404)

    // Only accept GET here
    if (c.req.method !== 'GET') return c.text('Method not allowed', 405)

    // Create a Request to use with cache API
    const cacheKey = makeCacheKeyFromContext(c)
    const cacheRequest = new Request(cacheKey, { method: 'GET' })
    // Open named cache (persists within the worker instance)
    const cache = await caches.open('redirects')

    // Check for existing cached response first
    const cachedResponse = await cache.match(cacheRequest)

    if (cachedResponse) {

      const text = await cachedResponse.clone().text()
      console.log('Returning cached response:', text)

      return c.json({
        fromCache: true,
        slug,
        cachedBody: text,
        cacheKey,
        timestamp: new Date().toISOString()
      })
    } else {
      // Cache miss - generate new response and cache it
      const responseBody = `Generated content for slug="${slug}" at ${new Date().toISOString()}`
      
      // Create response with cache headers
      const response = new Response(responseBody, {
        status: 200,
        headers: { 
          'Content-Type': 'text/plain',
          'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
        },
      })

      // Store in cache as a background task - response is sent immediately
      // while cache is updated asynchronously
      c.executionCtx.waitUntil(
        cache.put(cacheRequest, response.clone()).then(() => {
          console.log('Background task: Stored new response in cache')
        }).catch((error) => {
          console.error('Background task: Failed to store in cache:', error)
        })
      )

      return c.json({
        fromCache: false,
        slug,
        body: responseBody,
        cacheKey,
        timestamp: new Date().toISOString()
      })
    }
  }
)

export default app
