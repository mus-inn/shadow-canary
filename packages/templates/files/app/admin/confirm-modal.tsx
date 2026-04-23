'use client';

import { useEffect, useRef, useState } from 'react';

type Tone = 'danger' | 'warn';

type Props = {
  open: boolean;
  tone?: Tone;
  title: string;
  body: React.ReactNode;
  // If set, require the user to type this string before confirming (third
  // step after opening the modal and clicking confirm — prevents misclicks on
  // destructive ops like Cancel, Promote, Rollback).
  confirmPhrase?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  pending?: boolean;
};

export function ConfirmModal({
  open,
  tone = 'danger',
  title,
  body,
  confirmPhrase,
  confirmLabel,
  onConfirm,
  onClose,
  pending = false,
}: Props) {
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Reset challenge input whenever the modal opens.
  useEffect(() => {
    if (open) {
      setTyped('');
      // Delay focus until the scale-in animation starts — feels less jarring
      // than focusing before the modal is visible.
      const id = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
  }, [open]);

  // Escape closes, without dismissing while an action is pending.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, pending]);

  if (!open) return null;

  const phraseRequired = Boolean(confirmPhrase);
  const phraseOk = !phraseRequired || typed.trim() === confirmPhrase;

  return (
    <div
      className="adm-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="adm-modal-title"
    >
      <div className="adm-modal">
        <div
          className={`adm-modal-icon${tone === 'warn' ? ' adm-modal-icon--warn' : ''}`}
          aria-hidden="true"
        >
          {tone === 'warn' ? '!' : '⚠'}
        </div>
        <h2 id="adm-modal-title" className="adm-modal-title">
          {title}
        </h2>
        <div className="adm-modal-body">{body}</div>

        {phraseRequired && (
          <div className="adm-modal-challenge">
            <div className="adm-modal-challenge-label">
              Pour confirmer, tape <code>{confirmPhrase}</code> ci-dessous :
            </div>
            <input
              ref={inputRef}
              className="adm-input adm-modal-challenge-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && phraseOk && !pending) onConfirm();
              }}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              aria-label="Phrase de confirmation"
            />
          </div>
        )}

        <div className="adm-modal-actions">
          <button
            type="button"
            className="adm-btn adm-btn--ghost"
            onClick={onClose}
            disabled={pending}
          >
            Annuler
          </button>
          <button
            type="button"
            className={`adm-btn ${tone === 'warn' ? 'adm-btn--primary' : 'adm-btn--danger'}${pending ? ' adm-btn--pending' : ''}`}
            onClick={onConfirm}
            disabled={!phraseOk || pending}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
