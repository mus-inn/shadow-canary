export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const { err } = await searchParams;
  const hasError = err === '1';

  return (
    <main className="adm-login-main">
      <form method="post" action="/api/admin/login" className="adm-login-form">
        <h1 className="adm-login-title">Canary control</h1>
        <p className="adm-login-hint">
          Accès restreint — authentification requise pour piloter les canary.
        </p>
        <input
          name="username"
          placeholder="Username"
          autoComplete="username"
          required
          className="adm-login-field"
          aria-label="Username"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          required
          className="adm-login-field"
          aria-label="Password"
        />
        <button type="submit" className="adm-login-submit">
          Sign in
        </button>
        {hasError && (
          <p role="alert" className="adm-login-error">
            Identifiants invalides.
          </p>
        )}
      </form>
    </main>
  );
}
