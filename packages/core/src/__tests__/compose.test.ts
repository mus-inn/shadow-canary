import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ShadowConfig } from '../types.js';

// ---------------------------------------------------------------------------
// Minimal NextRequest / NextResponse stubs
// ---------------------------------------------------------------------------

class MockURL {
  hostname: string;
  protocol: string;
  port: string;
  pathname: string;
  search: string;

  constructor(input: string, base?: string) {
    // Very minimal — just enough for the middleware logic
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

  toString() {
    return `${this.protocol}//${this.hostname}${this.port ? ':' + this.port : ''}${this.pathname}${this.search}`;
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
    if (init instanceof MockHeaders) {
      this.store = new Map(init.store);
    } else {
      this.store = new Map(Object.entries(init));
    }
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

// ---------------------------------------------------------------------------
// Mock next/server and @vercel/edge-config
// ---------------------------------------------------------------------------

vi.mock('next/server', () => ({
  NextResponse: MockNextResponse,
}));

vi.mock('../edge-config/read.js', () => ({
  getShadowConfig: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

const { shadowCanaryMiddleware } = await import('../middleware/compose.js');
const { getShadowConfig } = await import('../edge-config/read.js');

const mockGetShadowConfig = getShadowConfig as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_CFG: ShadowConfig = {
  deploymentDomainProd: 'prod.example.vercel.app',
  deploymentDomainShadow: 'shadow.example.vercel.app',
  trafficShadowPercent: 1,
  trafficProdCanaryPercent: 100,
};

function makeReq(init: MockNextRequestInit = {}): MockNextRequest {
  return new MockNextRequest({
    url: 'https://example.com/page',
    ...init,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env['VERCEL_GIT_COMMIT_REF'];
  delete process.env['VERCEL_ENV'];
  delete process.env['VERCEL_AUTOMATION_BYPASS_SECRET'];
  mockGetShadowConfig.mockResolvedValue(BASE_CFG);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('shadowCanaryMiddleware — early returns (null = passthrough)', () => {
  it('returns null when x-shadow-routed header is present (prevents loops)', async () => {
    const req = makeReq({ headers: { 'x-shadow-routed': '1' } });
    const result = await shadowCanaryMiddleware(
      req as unknown as Parameters<typeof shadowCanaryMiddleware>[0],
    );
    expect(result).toBeNull();
    expect(mockGetShadowConfig).not.toHaveBeenCalled();
  });

  it('returns null on non-production git branch', async () => {
    process.env['VERCEL_GIT_COMMIT_REF'] = 'master';
    const req = makeReq();
    const result = await shadowCanaryMiddleware(
      req as unknown as Parameters<typeof shadowCanaryMiddleware>[0],
    );
    expect(result).toBeNull();
    expect(mockGetShadowConfig).not.toHaveBeenCalled();
  });

  it('returns null on preview Vercel env', async () => {
    process.env['VERCEL_ENV'] = 'preview';
    const req = makeReq();
    const result = await shadowCanaryMiddleware(
      req as unknown as Parameters<typeof shadowCanaryMiddleware>[0],
    );
    expect(result).toBeNull();
  });

  it('returns null for bot user-agents', async () => {
    const req = makeReq({
      headers: { 'user-agent': 'Googlebot/2.1' },
    });
    const result = await shadowCanaryMiddleware(
      req as unknown as Parameters<typeof shadowCanaryMiddleware>[0],
    );
    expect(result).toBeNull();
    expect(mockGetShadowConfig).not.toHaveBeenCalled();
  });

  it('returns null when getShadowConfig returns null (no config)', async () => {
    mockGetShadowConfig.mockResolvedValue(null);
    const req = makeReq();
    const result = await shadowCanaryMiddleware(
      req as unknown as Parameters<typeof shadowCanaryMiddleware>[0],
    );
    expect(result).toBeNull();
  });
});

describe('shadowCanaryMiddleware — IP force to shadow', () => {
  it('rewrites to shadow when client IP is in shadowForceIPs', async () => {
    mockGetShadowConfig.mockResolvedValue({
      ...BASE_CFG,
      shadowForceIPs: ['1.2.3.4'],
    });
    const req = makeReq({
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });
    const result = (await shadowCanaryMiddleware(
      req as unknown as Parameters<typeof shadowCanaryMiddleware>[0],
    )) as MockNextResponse | null;
    expect(result).not.toBeNull();
    expect(result!.type).toBe('rewrite');
    expect(result!.rewriteUrl?.hostname).toBe('shadow.example.vercel.app');
    // IP-forced traffic must NOT set a cookie (so the IP can be removed later)
    expect(result!.cookies.setCalls).toHaveLength(0);
  });
});

describe('shadowCanaryMiddleware — sticky cookie routing', () => {
  it('rewrites to shadow when shadow-bucket=shadow cookie is present', async () => {
    const req = makeReq({ cookies: { 'shadow-bucket': 'shadow' } });
    const result = (await shadowCanaryMiddleware(
      req as unknown as Parameters<typeof shadowCanaryMiddleware>[0],
    )) as MockNextResponse | null;
    expect(result).not.toBeNull();
    expect(result!.type).toBe('rewrite');
    expect(result!.rewriteUrl?.hostname).toBe('shadow.example.vercel.app');
    // Sticky — no new cookie should be set
    expect(result!.cookies.setCalls).toHaveLength(0);
  });

  it('rewrites to previous prod when shadow-bucket=prod-previous and previous exists', async () => {
    mockGetShadowConfig.mockResolvedValue({
      ...BASE_CFG,
      deploymentDomainProdPrevious: 'prev.example.vercel.app',
      trafficProdCanaryPercent: 50,
    });
    const req = makeReq({ cookies: { 'shadow-bucket': 'prod-previous' } });
    const result = (await shadowCanaryMiddleware(
      req as unknown as Parameters<typeof shadowCanaryMiddleware>[0],
    )) as MockNextResponse | null;
    expect(result).not.toBeNull();
    expect(result!.type).toBe('rewrite');
    expect(result!.rewriteUrl?.hostname).toBe('prev.example.vercel.app');
  });

  it('passes through (or sets cookie) when shadow-bucket=prod-new', async () => {
    const req = makeReq({ cookies: { 'shadow-bucket': 'prod-new' } });
    const result = (await shadowCanaryMiddleware(
      req as unknown as Parameters<typeof shadowCanaryMiddleware>[0],
    )) as MockNextResponse | null;
    // No canary active (pct=100, no previous), cookie already correct → null
    expect(result).toBeNull();
  });
});

describe('shadowCanaryMiddleware — random routing', () => {
  it('routes 100% to shadow when trafficShadowPercent=100 (random=0)', async () => {
    mockGetShadowConfig.mockResolvedValue({
      ...BASE_CFG,
      trafficShadowPercent: 100,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const req = makeReq();
    const result = (await shadowCanaryMiddleware(
      req as unknown as Parameters<typeof shadowCanaryMiddleware>[0],
    )) as MockNextResponse | null;
    expect(result?.type).toBe('rewrite');
    expect(result?.rewriteUrl?.hostname).toBe('shadow.example.vercel.app');
    // Should set shadow cookie
    expect(result?.cookies.setCalls[0]?.value).toBe('shadow');
  });

  it('does not route to shadow when trafficShadowPercent=0', async () => {
    mockGetShadowConfig.mockResolvedValue({
      ...BASE_CFG,
      trafficShadowPercent: 0,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const req = makeReq();
    const result = (await shadowCanaryMiddleware(
      req as unknown as Parameters<typeof shadowCanaryMiddleware>[0],
    )) as MockNextResponse | null;
    // Should not be a shadow rewrite
    if (result !== null) {
      expect(result.rewriteUrl?.hostname).not.toBe('shadow.example.vercel.app');
    }
  });

  it('routes to previous prod when canaryPct=0 and previous exists', async () => {
    mockGetShadowConfig.mockResolvedValue({
      ...BASE_CFG,
      trafficShadowPercent: 0,
      deploymentDomainProdPrevious: 'prev.example.vercel.app',
      trafficProdCanaryPercent: 0,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const req = makeReq();
    const result = (await shadowCanaryMiddleware(
      req as unknown as Parameters<typeof shadowCanaryMiddleware>[0],
    )) as MockNextResponse | null;
    expect(result?.type).toBe('rewrite');
    expect(result?.rewriteUrl?.hostname).toBe('prev.example.vercel.app');
  });
});

describe('shadowCanaryMiddleware — custom options', () => {
  it('respects custom cookieName option', async () => {
    mockGetShadowConfig.mockResolvedValue({
      ...BASE_CFG,
      trafficShadowPercent: 100,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const req = makeReq();
    const result = (await shadowCanaryMiddleware(
      req as unknown as Parameters<typeof shadowCanaryMiddleware>[0],
      { cookieName: 'my-bucket' },
    )) as MockNextResponse | null;
    expect(result?.cookies.setCalls[0]?.name).toBe('my-bucket');
  });

  it('respects custom botPattern option', async () => {
    const req = makeReq({
      headers: { 'user-agent': 'MyCustomMonitor/1.0' },
    });
    const result = await shadowCanaryMiddleware(
      req as unknown as Parameters<typeof shadowCanaryMiddleware>[0],
      { botPattern: /myCustomMonitor/i },
    );
    expect(result).toBeNull();
  });
});

describe('shadowCanaryMiddleware — Vercel Deployment Protection bypass', () => {
  it('injects bypass headers on shadow rewrite when VERCEL_AUTOMATION_BYPASS_SECRET is set', async () => {
    process.env['VERCEL_AUTOMATION_BYPASS_SECRET'] = 'env-secret';
    mockGetShadowConfig.mockResolvedValue({
      ...BASE_CFG,
      trafficShadowPercent: 100,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const req = makeReq();
    const result = (await shadowCanaryMiddleware(
      req as unknown as Parameters<typeof shadowCanaryMiddleware>[0],
    )) as MockNextResponse | null;
    expect(result?.type).toBe('rewrite');
    const headers = result!.requestHeaders as unknown as Headers;
    expect(headers.get('x-vercel-protection-bypass')).toBe('env-secret');
    expect(headers.get('x-vercel-set-bypass-cookie')).toBe('samesitenone');
  });

  it('bypassToken option takes precedence over VERCEL_AUTOMATION_BYPASS_SECRET', async () => {
    process.env['VERCEL_AUTOMATION_BYPASS_SECRET'] = 'env-secret';
    mockGetShadowConfig.mockResolvedValue({
      ...BASE_CFG,
      trafficShadowPercent: 100,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const req = makeReq();
    const result = (await shadowCanaryMiddleware(
      req as unknown as Parameters<typeof shadowCanaryMiddleware>[0],
      { bypassToken: 'explicit-token' },
    )) as MockNextResponse | null;
    const headers = result!.requestHeaders as unknown as Headers;
    expect(headers.get('x-vercel-protection-bypass')).toBe('explicit-token');
  });

  it('omits bypass headers when no token is configured', async () => {
    mockGetShadowConfig.mockResolvedValue({
      ...BASE_CFG,
      trafficShadowPercent: 100,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const req = makeReq();
    const result = (await shadowCanaryMiddleware(
      req as unknown as Parameters<typeof shadowCanaryMiddleware>[0],
    )) as MockNextResponse | null;
    const headers = result!.requestHeaders as unknown as Headers;
    expect(headers.get('x-vercel-protection-bypass')).toBeNull();
    expect(headers.get('x-vercel-set-bypass-cookie')).toBeNull();
    // routedHeader still set — sanity check that header wiring isn't broken
    expect(headers.get('x-shadow-routed')).toBe('1');
  });

  it('empty bypassToken option disables auto-detection from env', async () => {
    process.env['VERCEL_AUTOMATION_BYPASS_SECRET'] = 'env-secret';
    mockGetShadowConfig.mockResolvedValue({
      ...BASE_CFG,
      trafficShadowPercent: 100,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const req = makeReq();
    const result = (await shadowCanaryMiddleware(
      req as unknown as Parameters<typeof shadowCanaryMiddleware>[0],
      { bypassToken: '' },
    )) as MockNextResponse | null;
    const headers = result!.requestHeaders as unknown as Headers;
    expect(headers.get('x-vercel-protection-bypass')).toBeNull();
  });

  it('injects bypass headers on previous-prod rewrite too', async () => {
    process.env['VERCEL_AUTOMATION_BYPASS_SECRET'] = 'env-secret';
    mockGetShadowConfig.mockResolvedValue({
      ...BASE_CFG,
      trafficShadowPercent: 0,
      deploymentDomainProdPrevious: 'prev.example.vercel.app',
      trafficProdCanaryPercent: 0,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const req = makeReq();
    const result = (await shadowCanaryMiddleware(
      req as unknown as Parameters<typeof shadowCanaryMiddleware>[0],
    )) as MockNextResponse | null;
    expect(result?.rewriteUrl?.hostname).toBe('prev.example.vercel.app');
    const headers = result!.requestHeaders as unknown as Headers;
    expect(headers.get('x-vercel-protection-bypass')).toBe('env-secret');
    expect(headers.get('x-vercel-set-bypass-cookie')).toBe('samesitenone');
  });
});
