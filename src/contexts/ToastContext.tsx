import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

interface ToastContextValue {
  addToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ addToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const TOAST_COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)',  icon: '#22c55e' },
  error:   { bg: 'rgba(248,81,73,0.12)',  border: 'rgba(248,81,73,0.3)',  icon: '#f85149' },
  info:    { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', icon: '#3b82f6' },
};

const TOAST_ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={16} />,
  error:   <AlertCircle  size={16} />,
  info:    <Info         size={16} />,
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const c = TOAST_COLORS[toast.type];
  return (
    <div
      className="animate-toast-in flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg pointer-events-auto"
      style={{
        background: '#1c2333',
        border: `1px solid ${c.border}`,
        minWidth: '260px',
        maxWidth: '380px',
      }}
    >
      <span style={{ color: c.icon, flexShrink: 0 }}>{TOAST_ICONS[toast.type]}</span>
      <span className="flex-1 text-sm font-medium" style={{ color: '#e6edf3' }}>{toast.message}</span>
      <button
        onClick={onDismiss}
        className="p-0.5 rounded hover:opacity-70 transition-opacity shrink-0"
        style={{ color: '#7d8590' }}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(t => t.filter(x => x.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => removeToast(id), 3500);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}

      {/* Toast container — bottom-center on mobile, bottom-right on desktop */}
      <div
        className="fixed z-[9999] flex flex-col gap-2 pointer-events-none items-center md:items-end"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)',
          left: '1rem',
          right: '1rem',
        }}
      >
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
