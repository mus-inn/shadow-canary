import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ShadowConfig } from '../types.js';

// ---------------------------------------------------------------------------
// Minimal NextRequest / NextResponse stubs (mirror compose.test.ts)
// ---------------------------------------------------------------------------

class MockURL {
  hostname: string;
  protocol: string;
  port: string;
  pathname: string;
  search: string;

  constructor(input: string, base?: string) {
    const raw = base ? new URL(input, base) : new URL(input);
    this.hostname = raw.hostname;
    this.protocol = raw.protocol;
    this.port = raw.port;
    this.pathname = raw.pathname;
    this.search = raw.search;
  }

  clone() {
    const c = new MockURL('http://placeholder');
    c.hostname = this.hostname;
    c.protocol = this.protocol;
    c.port = this.port;
    c.pathname = this.pathname;
    c.search = this.search;
    return c;
  }
}

interface MockCookie {
  value: string;
}
interface SetCookieCall {
  name: string;
  value: string;
  options: Record<string, unknown>;
}

class MockCookies {
  private store: Map<string, MockCookie>;
  public setCalls: SetCookieCall[] = [];
  constructor(initial: Record<string, string> = {}) {
    this.store = new Map(
      Object.entries(initial).map(([k, v]) => [k, { value: v }]),
    );
  }
  get(name: string): MockCookie | undefined {
    return this.store.get(name);
  }
  set(name: string, value: string, options: Record<string, unknown> = {}) {
    this.setCalls.push({ name, value, options });
    this.store.set(name, { value });
  }
}

class MockHeaders {
  private store: Map<string, string>;
  constructor(init: Record<string, string> | MockHeaders = {}) {
    if (init instanceof MockHeaders) this.store = new Map(init.store);
    else this.store = new Map(Object.entries(init));
  }
  get(name: string): string | null {
    return this.store.get(name.toLowerCase()) ?? null;
  }
  set(name: string, value: string) {
    this.store.set(name.toLowerCase(), value);
  }
}

interface MockNextRequestInit {
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  url?: string;
}

class MockNextRequest {
  headers: MockHeaders;
  cookies: MockCookies;
  nextUrl: MockURL;
  constructor(init: MockNextRequestInit = {}) {
    this.headers = new MockHeaders(init.headers ?? {});
    this.cookies = new MockCookies(init.cookies ?? {});
    this.nextUrl = new MockURL(init.url ?? 'https://example.com/');
  }
}

class MockNextResponse {
  public type: 'rewrite' | 'next';
  public rewriteUrl?: MockURL;
  public cookies: MockCookies;
  public requestHeaders?: MockHeaders;
  constructor(type: 'rewrite' | 'next', url?: MockURL, headers?: MockHeaders) {
    this.type = type;
    this.rewriteUrl = url;
    this.cookies = new MockCookies();
    this.requestHeaders = headers;
  }
  static rewrite(
    url: MockURL,
    opts?: { request?: { headers?: MockHeaders } },
  ): MockNextResponse {
    return new MockNextResponse('rewrite', url, opts?.request?.headers);
  }
  static next(): MockNextResponse {
    return new MockNextResponse('next');
  }
}

vi.mock('next/server', () => ({ NextResponse: MockNextResponse }));
vi.mock('../edge-config/read.js', () => ({ getShadowConfig: vi.fn() }));

const { slotCanaryMiddleware, slotCanaryProxy } = await import(
  '../middleware/slots.js'
);
const { getShadowConfig } = await import('../edge-config/read.js');
const mockGetShadowConfig = getShadowConfig as ReturnType<typeof vi.fn>;

const NIGHTLY = 'nightly.example.vercel.app';
const CANARY = 'canary.example.vercel.app';

const BASE_CFG: ShadowConfig = {
  domainNightly: NIGHTLY,
  domainCanary: CANARY,
  trafficNightlyPercent: 5,
  trafficCanaryPercent: 20,
};

function makeReq(init: MockNextRequestInit = {}): MockNextRequest {
  return new MockNextRequest({ url: 'https://example.com/page', ...init });
}

type Mw = typeof slotCanaryMiddleware;
function run(
  req: MockNextRequest,
  opts?: Parameters<Mw>[1],
): Promise<MockNextResponse | null> {
  return slotCanaryMiddleware(
    req as unknown as Parameters<Mw>[0],
    opts,
  ) as Promise<MockNextResponse | null>;
}

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env['VERCEL_TARGET_ENV'];
  delete process.env['VERCEL_ENV'];
  delete process.env['VERCEL_GIT_COMMIT_REF'];
  delete process.env['VERCEL_AUTOMATION_BYPASS_SECRET'];
  delete process.env['SHADOW_CANARY_ROUTING_ENV'];
  delete process.env['SHADOW_CANARY_PRODUCTION_BRANCH'];
  process.env['VERCEL_TARGET_ENV'] = 'production'; // we ARE the routing deploy
  mockGetShadowConfig.mockResolvedValue(BASE_CFG);
});

describe('slotCanaryProxy alias', () => {
  it('is the same reference as slotCanaryMiddleware', () => {
    expect(slotCanaryProxy).toBe(slotCanaryMiddleware);
  });
});

describe('slotCanaryMiddleware — early returns (null = passthrough)', () => {
  it('returns null on x-shadow-routed (loop guard)', async () => {
    expect(await run(makeReq({ headers: { 'x-shadow-routed': '1' } }))).toBeNull();
    expect(mockGetShadowConfig).not.toHaveBeenCalled();
  });

  it('returns null on the nightly slot deploy', async () => {
    process.env['VERCEL_TARGET_ENV'] = 'nightly';
    expect(await run(makeReq())).toBeNull();
    expect(mockGetShadowConfig).not.toHaveBeenCalled();
  });

  it('returns null on the canary slot deploy', async () => {
    process.env['VERCEL_TARGET_ENV'] = 'canary';
    expect(await run(makeReq())).toBeNull();
  });

  it('returns null on preview deploys', async () => {
    process.env['VERCEL_TARGET_ENV'] = 'preview';
    expect(await run(makeReq())).toBeNull();
  });

  it('returns null for bots', async () => {
    expect(
      await run(makeReq({ headers: { 'user-agent': 'Googlebot/2.1' } })),
    ).toBeNull();
    expect(mockGetShadowConfig).not.toHaveBeenCalled();
  });

  it('returns null when config is absent', async () => {
    mockGetShadowConfig.mockResolvedValue(null);
    expect(await run(makeReq())).toBeNull();
  });

  it('passthrough (null) without reading config when not the routing deploy (custom-env, target env unset)', async () => {
    // The hole: VERCEL_TARGET_ENV unset (older runtime / local dev) must NOT
    // fall through and run the split. Must return before touching Edge Config.
    delete process.env['VERCEL_TARGET_ENV'];
    expect(await run(makeReq())).toBeNull();
    expect(mockGetShadowConfig).not.toHaveBeenCalled();
  });

  it('rethrows when config read throws on the routing env', async () => {
    process.env['VERCEL_TARGET_ENV'] = 'production';
    mockGetShadowConfig.mockRejectedValueOnce(new Error('repo slug missing'));
    await expect(run(makeReq())).rejects.toThrow(/repo slug missing/);
  });
});

describe('slotCanaryMiddleware — IP force to nightly', () => {
  it('rewrites to nightly for a forced IP, no cookie', async () => {
    mockGetShadowConfig.mockResolvedValue({
      ...BASE_CFG,
      forceNightlyIPs: ['1.2.3.4'],
    });
    const result = await run(
      makeReq({ headers: { 'x-forwarded-for': '1.2.3.4' } }),
    );
    expect(result!.type).toBe('rewrite');
    expect(result!.rewriteUrl?.hostname).toBe(NIGHTLY);
    expect(result!.cookies.setCalls).toHaveLength(0);
  });
});

describe('slotCanaryMiddleware — sticky cookie routing', () => {
  it('nightly cookie → nightly rewrite, no new cookie', async () => {
    const result = await run(makeReq({ cookies: { 'shadow-bucket': 'nightly' } }));
    expect(result!.rewriteUrl?.hostname).toBe(NIGHTLY);
    expect(result!.cookies.setCalls).toHaveLength(0);
  });

  it('canary cookie → canary rewrite', async () => {
    const result = await run(makeReq({ cookies: { 'shadow-bucket': 'canary' } }));
    expect(result!.rewriteUrl?.hostname).toBe(CANARY);
  });

  it('production cookie → passthrough null', async () => {
    expect(
      await run(makeReq({ cookies: { 'shadow-bucket': 'production' } })),
    ).toBeNull();
  });

  it('garbage cookie → fresh roll', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // nightly
    const result = await run(makeReq({ cookies: { 'shadow-bucket': 'x' } }));
    expect(result!.rewriteUrl?.hostname).toBe(NIGHTLY);
    expect(result!.cookies.setCalls[0]?.value).toBe('nightly');
  });
});

describe('slotCanaryMiddleware — random split', () => {
  it('roll < nightly% → nightly + cookie', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    const result = await run(makeReq());
    expect(result!.rewriteUrl?.hostname).toBe(NIGHTLY);
    expect(result!.cookies.setCalls[0]?.value).toBe('nightly');
  });

  it('roll in canary band → canary', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // 10 ∈ [5,25)
    const result = await run(makeReq());
    expect(result!.rewriteUrl?.hostname).toBe(CANARY);
  });

  it('roll above bands → production passthrough (cookie on next())', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const result = await run(makeReq());
    expect(result!.type).toBe('next');
    expect(result!.cookies.setCalls[0]?.value).toBe('production');
  });

  it('zero percentages → everything on production', async () => {
    mockGetShadowConfig.mockResolvedValue({
      ...BASE_CFG,
      trafficNightlyPercent: 0,
      trafficCanaryPercent: 0,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    expect((await run(makeReq()))!.type).toBe('next');
  });

  it('missing slot domain falls back to production', async () => {
    mockGetShadowConfig.mockResolvedValue({
      trafficNightlyPercent: 100,
      trafficCanaryPercent: 0,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    expect((await run(makeReq()))!.type).toBe('next');
  });

  it('clamps out-of-range percentages', async () => {
    mockGetShadowConfig.mockResolvedValue({
      ...BASE_CFG,
      trafficNightlyPercent: 999,
      trafficCanaryPercent: -5,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    expect((await run(makeReq()))!.rewriteUrl?.hostname).toBe(NIGHTLY);
  });
});

describe('slotCanaryMiddleware — options', () => {
  it('custom cookieName', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = await run(makeReq(), { cookieName: 'my-bucket' });
    expect(result!.cookies.setCalls[0]?.name).toBe('my-bucket');
  });

  it('custom routingEnv', async () => {
    process.env['VERCEL_TARGET_ENV'] = 'prod-eu';
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = await run(makeReq(), { routingEnv: 'prod-eu' });
    expect(result!.rewriteUrl?.hostname).toBe(NIGHTLY);
  });

  it('SHADOW_CANARY_ROUTING_ENV override', async () => {
    process.env['VERCEL_TARGET_ENV'] = 'prod-eu';
    process.env['SHADOW_CANARY_ROUTING_ENV'] = 'prod-eu';
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect((await run(makeReq()))!.rewriteUrl?.hostname).toBe(NIGHTLY);
  });
});

describe('slotCanaryMiddleware — branch mode (no Custom Environments)', () => {
  // All slots deploy --prod to the same env; the git branch is the only signal.
  it('production-branch deploy owns the split and rewrites', async () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['VERCEL_GIT_COMMIT_REF'] = 'production';
    vi.spyOn(Math, 'random').mockReturnValue(0); // nightly
    const result = await run(makeReq(), { productionBranch: 'production' });
    expect(result!.rewriteUrl?.hostname).toBe(NIGHTLY);
  });

  it('nightly (main) branch deploy serves its own content (null)', async () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['VERCEL_GIT_COMMIT_REF'] = 'main';
    expect(await run(makeReq(), { productionBranch: 'production' })).toBeNull();
    expect(mockGetShadowConfig).not.toHaveBeenCalled();
  });

  it('canary branch deploy serves its own content (null)', async () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['VERCEL_GIT_COMMIT_REF'] = 'canary';
    expect(await run(makeReq(), { productionBranch: 'production' })).toBeNull();
  });

  it('preview deploys pass through in branch mode', async () => {
    process.env['VERCEL_ENV'] = 'preview';
    process.env['VERCEL_GIT_COMMIT_REF'] = 'production';
    expect(await run(makeReq(), { productionBranch: 'production' })).toBeNull();
  });

  it('honors SHADOW_CANARY_PRODUCTION_BRANCH env var', async () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['VERCEL_GIT_COMMIT_REF'] = 'prod';
    process.env['SHADOW_CANARY_PRODUCTION_BRANCH'] = 'prod';
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = await run(makeReq());
    expect(result!.rewriteUrl?.hostname).toBe(NIGHTLY);
  });

  it('rethrows a config error on the production-branch deploy', async () => {
    process.env['VERCEL_ENV'] = 'production';
    process.env['VERCEL_GIT_COMMIT_REF'] = 'production';
    mockGetShadowConfig.mockRejectedValueOnce(new Error('repo slug missing'));
    await expect(
      run(makeReq(), { productionBranch: 'production' }),
    ).rejects.toThrow(/repo slug missing/);
  });
});

describe('slotCanaryMiddleware — deployment protection bypass', () => {
  it('injects bypass headers on a nightly rewrite', async () => {
    process.env['VERCEL_AUTOMATION_BYPASS_SECRET'] = 'env-secret';
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = await run(makeReq());
    const headers = result!.requestHeaders as unknown as Headers;
    expect(headers.get('x-vercel-protection-bypass')).toBe('env-secret');
    expect(headers.get('x-vercel-set-bypass-cookie')).toBe('samesitenone');
  });

  it('omits bypass headers when no token, still sets routed header', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = await run(makeReq());
    const headers = result!.requestHeaders as unknown as Headers;
    expect(headers.get('x-vercel-protection-bypass')).toBeNull();
    expect(headers.get('x-shadow-routed')).toBe('1');
  });
});
