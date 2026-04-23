import { PingPong } from './components/ping-pong';

export const dynamic = 'force-dynamic';

export default function Home() {
  const branch = process.env.VERCEL_GIT_COMMIT_REF ?? 'local';
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev';
  const deployId = process.env.VERCEL_DEPLOYMENT_ID ?? 'local';

  return (
    <main className="page">
      <h1 className="hm-title">
        vercel-custom-shadow
        <span className="hm-title-badge">canary demo</span>
      </h1>

      <p className="hm-lede">
        Un seul code, plusieurs déploiements en parallèle. Shadow permanent à
        1&nbsp;% (master) et promotion canary SLO-gated sur production. Les
        infos ci-dessous identifient le deploy qui a servi cette requête.
      </p>

      <div className="hm-pong">
        <PingPong />
      </div>

      <dl className="hm-meta">
        <dt>branch</dt>
        <dd>
          <code>{branch}</code>
        </dd>
        <dt>commit</dt>
        <dd>
          <code>{sha}</code>
        </dd>
        <dt>deploy</dt>
        <dd>
          <code>{deployId}</code>
        </dd>
      </dl>

      <p className="hm-back">
        <a href="/debug">→ Page debug</a>
      </p>
    </main>
  );
}
