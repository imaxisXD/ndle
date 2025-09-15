import { Redis } from "@upstash/redis/cloudflare";
import { type Context, Hono } from "hono";
import { logger } from "hono/logger";
import {
	buildRedirectResponse,
	checkCacheAndReturnElseSave,
	makeCacheRequestFromContext,
} from "./helper";

type Bindings = {
	UPSTASH_REDIS_REST_TOKEN: string;
	UPSTASH_REDIS_REST_URL: string;
};

const app = new Hono<{ Bindings: Bindings }>();
app.use(logger());

/**
 * Get the url from redis
 * @param c - The context
 * @returns The url
 */
async function getUrlFromRedis(c: Context) {
	const slug = c.req.param("websiteSlug");
	const redis = Redis.fromEnv(c.env);
	const urlString = await redis.get<string>(slug);

	if (urlString) {
		console.log("Redis: Found the url", urlString);
		return new URL(urlString);
	}
}

app.get("/:websiteSlug", async (c) => {
	const start = Date.now();
	const slug = c.req.param("websiteSlug");
	if (!slug) return c.text("Not found", 404);
	if (c.req.method !== "GET") return c.text("Method not allowed", 405);
	const cache = await caches.open("redirects");

	// Cache hit - return cached redirect (301 with Location header)
	const cached = await checkCacheAndReturnElseSave(c, cache);
	if (cached) {
		const redirectLatency = Date.now() - start;
		console.log(`🕰️ Redirect latency: ${redirectLatency}ms`);
		console.log(
			"Cache: Found the cached redirect",
			cached.headers.get("Location"),
		);
		return cached;
	}

	// Cache miss - get url from redis and store in Cloudflare cache
	const url = await getUrlFromRedis(c);

	if (url) {
		// Store in Cloudflare cache as a background task - response is sent immediately
		// while cache is updated asynchronously
		c.executionCtx.waitUntil(
			(async () => {
				try {
					const cacheRequest = makeCacheRequestFromContext(c);
					const redirectResponse = buildRedirectResponse(url);

					await cache.put(cacheRequest, redirectResponse);

					console.log("Background task: Stored new response in cache");
				} catch (error) {
					console.error(
						"Error: Background task: Failed to store in cache:",
						error,
					);
				}
			})(),
		);
		const response = buildRedirectResponse(url);
		const redirectLatency = Date.now() - start;
		console.log(`🕰️ Redirect latency: ${redirectLatency}ms`);
		return response;
	}
});

export default app;
