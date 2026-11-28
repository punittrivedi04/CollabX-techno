import crypto from "crypto";

/**
 * Ultra-lean bounded LRU + TTL in-memory cache with in-flight request coalescing.
 * Designed for shared hosts with strict 256MB V8 heap limits handling 2,000+ concurrent users.
 */
export class MicroCache {
    constructor({ maxEntries = 500, ttlMs = 3000 } = {}) {
        this.maxEntries = maxEntries;
        this.ttlMs = ttlMs;
        this.store = new Map();
        this.inFlight = new Map();
        this.generation = 0;
    }

    get(key) {
        const entry = this.store.get(key);
        if (!entry) return undefined;

        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return undefined;
        }

        // Refresh LRU recency in O(1)
        this.store.delete(key);
        this.store.set(key, entry);
        return entry.value;
    }

    set(key, value, ttlMs = this.ttlMs) {
        if (this.store.has(key)) {
            this.store.delete(key);
        } else if (this.store.size >= this.maxEntries) {
            // Evict least-recently-used key (oldest insertion in Map)
            const oldestKey = this.store.keys().next().value;
            if (oldestKey !== undefined) {
                this.store.delete(oldestKey);
            }
        }

        this.store.set(key, {
            value,
            expiresAt: Date.now() + ttlMs,
        });
    }

    async getOrSet(key, loader, ttlMs = this.ttlMs) {
        const cached = this.get(key);
        if (cached !== undefined) {
            return cached;
        }

        if (this.inFlight.has(key)) {
            return this.inFlight.get(key);
        }

        const startGen = this.generation;
        const promise = Promise.resolve()
            .then(loader)
            .then((result) => {
                // Only cache if no invalidation occurred while DB query was in flight
                if (this.generation === startGen && result !== undefined) {
                    this.set(key, result, ttlMs);
                }
                return result;
            })
            .finally(() => {
                this.inFlight.delete(key);
            });

        this.inFlight.set(key, promise);
        return promise;
    }

    delete(key) {
        this.store.delete(key);
        this.inFlight.delete(key);
    }

    clear() {
        this.generation += 1;
        this.store.clear();
        this.inFlight.clear();
    }

    size() {
        return this.store.size;
    }

    pruneExpired() {
        const now = Date.now();
        let removed = 0;
        for (const [key, entry] of this.store.entries()) {
            if (now > entry.expiresAt) {
                this.store.delete(key);
                removed += 1;
            }
        }
        return removed;
    }
}

// Primary read-endpoint micro cache (max 500 entries, 5s TTL)
export const readCache = new MicroCache({ maxEntries: 500, ttlMs: 5000 });

// Dedicated aggregate overview & leaderboard micro cache (max 200 entries, 8s TTL)
export const aggregateCache = new MicroCache({ maxEntries: 200, ttlMs: 8000 });

// Lightweight auth & project-access micro caches (prevent DB pool stampede under 2K concurrency)
export const userAuthCache = new MicroCache({ maxEntries: 500, ttlMs: 5000 });
export const projectAccessCache = new MicroCache({ maxEntries: 500, ttlMs: 5000 });

// Bounded per-user token revocation timestamps (invalidates existing 15m access tokens on logout / password reset / token reuse)
export const tokenRevocationCache = new MicroCache({ maxEntries: 1000, ttlMs: 20 * 60 * 1000 });
// Bounded per-token denylist (for immediate invalidation of specific logged-out Bearer JWTs)
export const revokedAccessTokenCache = new MicroCache({ maxEntries: 2000, ttlMs: 20 * 60 * 1000 });

const hashAccessToken = (token) =>
    crypto.createHash("sha256").update(String(token)).digest("hex");

export const revokeAccessToken = (rawToken) => {
    if (!rawToken || typeof rawToken !== "string") return;
    revokedAccessTokenCache.set(hashAccessToken(rawToken.trim()), true, 20 * 60 * 1000);
};

export const revokeUserTokens = (userId) => {
    const idKey = String(userId);
    const prev = tokenRevocationCache.get(idKey) || 0;
    const now = Math.max(Date.now(), prev + 1);
    tokenRevocationCache.set(idKey, now, 20 * 60 * 1000);
    return now;
};

export const getTokenRevocationTime = (userId) => {
    return tokenRevocationCache.get(String(userId)) || 0;
};

export const isTokenRevoked = (userId, decodedToken, rawToken = null) => {
    if (rawToken && revokedAccessTokenCache.get(hashAccessToken(rawToken))) {
        return true;
    }
    const revokedAt = tokenRevocationCache.get(String(userId));
    if (!revokedAt) return false;
    const issuedAtMs =
        typeof decodedToken?.iatMs === "number"
            ? decodedToken.iatMs
            : typeof decodedToken?.iat === "number"
                ? decodedToken.iat * 1000
                : 0;
    return issuedAtMs <= revokedAt;
};

export const invalidateAllCaches = () => {
    readCache.clear();
    aggregateCache.clear();
    projectAccessCache.clear();
};

export const invalidateUserCache = () => {
    userAuthCache.clear();
    readCache.clear();
    aggregateCache.clear();
    projectAccessCache.clear();
};

export default readCache;
