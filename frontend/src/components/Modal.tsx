import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
}

/** Near-fullscreen overlay. Closes on ✕, backdrop click, or Escape. */
export function Modal({ onClose, children }: ModalProps) {
  // Close on Escape + lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-card" onClick={(e) => e.stopPropagation()} tabIndex={-1} autoFocus>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close Modal" tabIndex={0}>
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
