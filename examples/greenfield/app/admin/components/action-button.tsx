'use client';

import type { ReactNode } from 'react';

type Props = {
  id: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pendingId: string | null;
  variant?: 'default' | 'primary' | 'danger';
};

export function ActionButton({
  id,
  children,
  onClick,
  disabled,
  pendingId,
  variant = 'default',
}: Props) {
  const isPending = pendingId === id;
  const className = [
    'adm-btn',
    variant === 'primary' && 'adm-btn--primary',
    variant === 'danger' && 'adm-btn--danger',
    isPending && 'adm-btn--pending',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
