// Simple in-memory cache for API requests
class APICache {
  constructor() {
    this.cache = new Map();
    this.timeouts = new Map();
  }

  set(key, data, ttl = 60000) { // Default 1 minute TTL
    // Clear existing timeout
    if (this.timeouts.has(key)) {
      clearTimeout(this.timeouts.get(key));
    }

    // Set data
    this.cache.set(key, data);

    // Set expiration timeout
    const timeout = setTimeout(() => {
      this.cache.delete(key);
      this.timeouts.delete(key);
    }, ttl);

    this.timeouts.set(key, timeout);
  }

  get(key) {
    return this.cache.get(key);
  }

  has(key) {
    return this.cache.has(key);
  }

  clear() {
    this.cache.clear();
    this.timeouts.forEach(timeout => clearTimeout(timeout));
    this.timeouts.clear();
  }
}

export const apiCache = new APICache();

// Cached fetch function
export const cachedFetch = async (url, options = {}, ttl = 60000) => {
  const cacheKey = `${url}_${JSON.stringify(options)}`;
  
  // Return cached data if available
  if (apiCache.has(cacheKey)) {
    return apiCache.get(cacheKey);
  }

  // Fetch new data
  const response = await fetch(url, options);
  const data = await response.json();

  // Cache the response
  apiCache.set(cacheKey, { response, data }, ttl);

  return { response, data };
};
