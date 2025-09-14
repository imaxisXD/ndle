import { Context } from "hono"
import { MAX_AGE_SECONDS } from "./const"

/**
 * Make a cache key from the context
 * @param c - The context
 * @returns The cache key
 */
function makeCacheKeyFromContext(c: Context): string {
    const url = new URL(c.req.url)
    const origin = url.origin.toLowerCase()
    let pathname = url.pathname.replace(/\/+$/, '') || '/'
    return `${origin}${pathname}`
}

/**
 * Make a cache request from the context
 * @param c - The context
 * @returns The cache request
 */
function makeCacheRequestFromContext(c: Context): Request {
    const cacheKey = makeCacheKeyFromContext(c)
    return new Request(cacheKey, { method: 'GET' })
}

/**
 * Build a redirect response
 * @param location - The location to redirect to
 * @returns The redirect response
 */
function buildRedirectResponse(location: URL): Response {
    return new Response('', {
        status: 301,
        headers: new Headers({
            'Location': location.toString(),
            'Cache-Control': `public, max-age=${MAX_AGE_SECONDS}`,
            'Content-Type': 'text/plain; charset=utf-8',
        })
    })
}

/**
 * Check the cache and return the response if it exists
 * @param c - The context
 * @param cache - The cache
 * @returns The cached response
 */
async function checkCacheAndReturnElseSave(c: Context, cache: Cache) {
    const cacheKey = makeCacheKeyFromContext(c)
    const cacheRequest = new Request(cacheKey, { method: 'GET' })

    // Check for existing cached response first
    const cachedResponse = await cache.match(cacheRequest)

    if (cachedResponse) {
        return cachedResponse
    }
}

export { makeCacheKeyFromContext, makeCacheRequestFromContext, buildRedirectResponse, checkCacheAndReturnElseSave }