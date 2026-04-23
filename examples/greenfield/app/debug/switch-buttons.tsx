'use client';

function setBucket(value: 'shadow' | 'prod' | null) {
  if (value === null) {
    document.cookie = 'shadow-bucket=; path=/; max-age=0; samesite=lax';
  } else {
    document.cookie = `shadow-bucket=${value}; path=/; max-age=86400; samesite=lax`;
  }
  window.location.href = '/debug';
}

export function SwitchButtons() {
  return (
    <div className="dbg-switches">
      <button
        type="button"
        className="dbg-switch dbg-switch--shadow"
        onClick={() => setBucket('shadow')}
      >
        Forcer SHADOW
      </button>
      <button
        type="button"
        className="dbg-switch dbg-switch--prod"
        onClick={() => setBucket('prod')}
      >
        Forcer PROD
      </button>
      <button
        type="button"
        className="dbg-switch dbg-switch--ghost"
        onClick={() => setBucket(null)}
      >
        Effacer (retour au split aléatoire)
      </button>
    </div>
  );
}
