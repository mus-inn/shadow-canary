import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { adminApi } from '../../../files/app/admin/api/admin-client';
import {
  AdminApiError,
  parseJsonError,
} from '../../../files/app/admin/api/errors';

type FetchInit = RequestInit | undefined;

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('adminApi GET helpers', () => {
  it('fetchState parses the response shape and uses no-store', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ config: { foo: 1 } }));
    const out = await adminApi.fetchState();
    expect(out).toEqual({ config: { foo: 1 } });
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe('/api/admin/state');
    expect((init as FetchInit)?.cache).toBe('no-store');
  });

  it('fetchDeployments returns the deployments array', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ deployments: [] }));
    expect(await adminApi.fetchDeployments()).toEqual({ deployments: [] });
  });

  it('fetchBucketInfo returns the map verbatim', async () => {
    const map = { shadow: null, prodNew: null, prodPrevious: null };
    mockFetch.mockResolvedValueOnce(okJson(map));
    expect(await adminApi.fetchBucketInfo()).toEqual(map);
  });

  it('fetchShadowHistory returns the entries wrapper', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ entries: [] }));
    expect(await adminApi.fetchShadowHistory()).toEqual({ entries: [] });
  });

  it('throws AdminApiError carrying the route message on non-2xx', async () => {
    mockFetch.mockResolvedValueOnce(errJson(503, { error: 'boom' }));
    await expect(adminApi.fetchState()).rejects.toBeInstanceOf(AdminApiError);
    mockFetch.mockResolvedValueOnce(errJson(503, { error: 'boom' }));
    await expect(adminApi.fetchState()).rejects.toMatchObject({
      message: 'boom',
      status: 503,
    });
  });
});

describe('adminApi POST helpers', () => {
  it('pause posts with no body and no Content-Type', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await adminApi.pause();
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe('/api/admin/canary/pause');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBeUndefined();
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('stepForward serializes the step in the body and sets Content-Type', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await adminApi.stepForward(7);
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe('/api/admin/canary/step-forward');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBe(JSON.stringify({ step: 7 }));
    expect(
      ((init as RequestInit).headers as Record<string, string>)['Content-Type'],
    ).toBe('application/json');
  });

  it('rollback serializes deploymentId and deploymentUrl', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await adminApi.rollback('dpl_1', 'https://prod-v2.example.com');
    const [, init] = mockFetch.mock.calls[0]!;
    expect((init as RequestInit).body).toBe(
      JSON.stringify({
        deploymentId: 'dpl_1',
        deploymentUrl: 'https://prod-v2.example.com',
      }),
    );
  });

  it('throws AdminApiError on failure', async () => {
    mockFetch.mockResolvedValueOnce(errJson(409, { error: 'conflict' }));
    await expect(adminApi.cancel()).rejects.toMatchObject({
      message: 'conflict',
      status: 409,
    });
  });
});

describe('parseJsonError', () => {
  it('uses the body error string when present', async () => {
    const e = await parseJsonError(errJson(500, { error: 'oops' }));
    expect(e).toBeInstanceOf(AdminApiError);
    expect(e.message).toBe('oops');
    expect(e.status).toBe(500);
  });

  it('falls back to HTTP <status> when the body is empty', async () => {
    const e = await parseJsonError(new Response(null, { status: 500 }));
    expect(e.message).toBe('HTTP 500');
  });

  it('falls back to HTTP <status> when the body is not JSON', async () => {
    const e = await parseJsonError(
      new Response('plain text', { status: 502 }),
    );
    expect(e.message).toBe('HTTP 502');
    expect(e.status).toBe(502);
  });

  it('ignores non-string error fields', async () => {
    const e = await parseJsonError(errJson(400, { error: 42 }));
    expect(e.message).toBe('HTTP 400');
  });
});
