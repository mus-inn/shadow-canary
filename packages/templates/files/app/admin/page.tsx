import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-auth';
import {
  listDeployments,
  readShadowConfig,
  type Deployment,
  type ShadowConfig,
} from '@/lib/admin-vercel';
import { AdminDashboard } from './dashboard-client';
import { CanaryDuck } from './canary-duck';

export const dynamic = 'force-dynamic';

type InitialData = {
  config: ShadowConfig | null;
  deployments: Deployment[];
  error: string | null;
};

async function loadInitialData(): Promise<InitialData> {
  try {
    const [config, deployments] = await Promise.all([
      readShadowConfig(),
      listDeployments(20),
    ]);
    return { config, deployments, error: null };
  } catch (e) {
    return {
      config: null,
      deployments: [],
      error: e instanceof Error ? e.message : 'unknown',
    };
  }
}

export default async function AdminPage() {
  if (!(await requireAdmin())) {
    redirect('/admin/login');
  }

  const initial = await loadInitialData();

  return (
    <main className="adm-container">
      <header className="adm-header">
        <div className="adm-brand">
          <CanaryDuck
            className="adm-brand-logo"
            title="Canary control"
          />
          <div className="adm-brand-text">
            <span className="adm-brand-eyebrow">shadow + canary</span>
            <h1 className="adm-title">Canary control</h1>
          </div>
        </div>
        <form method="post" action="/api/admin/logout">
          <button type="submit" className="adm-logout">
            Logout
          </button>
        </form>
      </header>

      <AdminDashboard initial={initial} />
    </main>
  );
}
