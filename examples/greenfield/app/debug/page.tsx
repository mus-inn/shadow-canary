import { cookies, headers } from 'next/headers';
import { SwitchButtons } from './switch-buttons';

export const dynamic = 'force-dynamic';

export default async function DebugPage() {
  const h = await headers();
  const c = await cookies();

  const branch = process.env.VERCEL_GIT_COMMIT_REF ?? 'local';
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev';
  const deployId = process.env.VERCEL_DEPLOYMENT_ID ?? 'local';

  const isShadow = branch === 'shadow';
  const accent = isShadow ? '#f97316' : '#3b82f6';
  const label = isShadow ? 'SHADOW · 1%' : 'PROD · 99%';

  const bucketCookie =
    c.get('shadow-bucket')?.value ?? "(aucun — le split aléatoire s'applique)";
  const forwarded = h.get('x-forwarded-for') ?? '(aucun)';
  const realIP = h.get('x-real-ip') ?? '(aucun)';
  const ua = h.get('user-agent') ?? '';
  const shadowRouted = h.get('x-shadow-routed') === '1';

  return (
    <main
      className="page page--wide"
      style={{ '--dbg-accent': accent } as React.CSSProperties}
    >
      <h1 className="dbg-title">Debug</h1>

      <div className="dbg-served">
        <div className="dbg-served-eyebrow">SERVED BY</div>
        <div className="dbg-served-label">{label}</div>
        <div className="dbg-served-meta">
          <span>
            branch=<code>{branch}</code>
          </span>
          <span>
            sha=<code>{sha}</code>
          </span>
          <span>
            deploy=<code>{deployId}</code>
          </span>
        </div>
      </div>

      <section className="dbg-section">
        <h2 className="dbg-section-title">Requête</h2>
        <dl className="dbg-list">
          <div className="dbg-row">
            <dt className="dbg-row-label">Sticky cookie</dt>
            <dd className="dbg-row-value">{bucketCookie}</dd>
          </div>
          <div className="dbg-row">
            <dt className="dbg-row-label">x-forwarded-for</dt>
            <dd className="dbg-row-value">{forwarded}</dd>
          </div>
          <div className="dbg-row">
            <dt className="dbg-row-label">x-real-ip</dt>
            <dd className="dbg-row-value">{realIP}</dd>
          </div>
          <div className="dbg-row">
            <dt className="dbg-row-label">x-shadow-routed (anti-loop)</dt>
            <dd className="dbg-row-value">{shadowRouted ? 'yes' : 'no'}</dd>
          </div>
          <div className="dbg-row">
            <dt className="dbg-row-label">User-Agent</dt>
            <dd className="dbg-row-value">{ua}</dd>
          </div>
        </dl>
      </section>

      <section className="dbg-section">
        <h2 className="dbg-section-title">Forcer le bucket</h2>
        <p className="dbg-section-hint">
          Les boutons posent simplement le cookie <code>shadow-bucket</code>. Le
          middleware le relira à la requête suivante. Le forçage par IP
          (allowlist bureau) passe avant ce cookie.
        </p>
        <SwitchButtons />
      </section>

      <p className="dbg-back">
        <a href="/">← Retour à l&apos;accueil</a>
      </p>
    </main>
  );
}
