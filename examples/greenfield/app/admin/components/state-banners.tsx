'use client';

type Props = {
  error: string | null;
  actionError: string | null;
};

export function StateBanners({ error, actionError }: Props) {
  if (!error && !actionError) return null;
  return (
    <>
      {error && (
        <div className="adm-banner adm-banner--error" role="alert">
          <span className="adm-banner-icon">⚠</span>
          <span>Backend : {error}</span>
        </div>
      )}
      {actionError && (
        <div className="adm-banner adm-banner--error" role="alert">
          <span className="adm-banner-icon">⚠</span>
          <span>Action : {actionError}</span>
        </div>
      )}
    </>
  );
}
