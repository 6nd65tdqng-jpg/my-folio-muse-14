interface RateLimitConfig {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

const DEFAULT_CONFIG: Required<RateLimitConfig> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRateLimit(
  url: string,
  options?: RequestInit,
  config: RateLimitConfig = {},
): Promise<Response> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        if (attempt >= cfg.maxRetries) {
          throw new Error(
            `Rate limit exceeded after ${cfg.maxRetries} retries`,
          );
        }
        const delay = Math.min(
          cfg.initialDelayMs * Math.pow(cfg.backoffMultiplier, attempt),
          cfg.maxDelayMs,
        );
        console.warn(`Rate limited. Retrying in ${delay}ms`);
        await sleep(delay);
        continue;
      }

      return response;
    } catch (error) {
      if (attempt >= cfg.maxRetries) throw error;
      const delay = Math.min(
        cfg.initialDelayMs * Math.pow(cfg.backoffMultiplier, attempt),
        cfg.maxDelayMs,
      );
      await sleep(delay);
    }
  }

  throw new Error("Max retries exceeded");
}

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number;

  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  async consume(cost = 1): Promise<void> {
    this.refill();
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return;
    }
    const tokensNeeded = cost - this.tokens;
    const waitMs = (tokensNeeded / this.refillRate) * 1000;
    await sleep(waitMs);
    this.refill();
    this.tokens -= cost;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

export const rateLimiters = {
  coingecko: new TokenBucket(10, 10 / 60),
  finnhub: new TokenBucket(60, 60 / 60),
};

export async function fetchWithThrottle(
  url: string,
  limiter: TokenBucket,
  options?: RequestInit,
  config?: RateLimitConfig,
): Promise<Response> {
  await limiter.consume();
  return fetchWithRateLimit(url, options, config);
}