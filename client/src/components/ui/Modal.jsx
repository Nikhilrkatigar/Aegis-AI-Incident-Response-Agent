import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';

export function Modal({ open, onClose, title, children, footer }) {
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    panel.current?.querySelector('textarea, input, button:not([data-close])')?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="panel w-full max-w-md"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <div className="px-5 pt-4 pb-3 border-b border-line">
              <h2 id="modal-title" className="text-[15px] font-semibold">{title}</h2>
            </div>
            <div className="px-5 py-4 text-[13.5px] leading-relaxed">{children}</div>
            {footer && <div className="px-5 py-3 border-t border-line flex justify-end gap-2 bg-bg/60 rounded-b-card">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
