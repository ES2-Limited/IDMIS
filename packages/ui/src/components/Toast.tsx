import * as React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../utils';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  showToast: (toast: Omit<ToastItem, 'id'>) => string;
  removeToast: (id: string) => void;
  success: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
}

const ToastContext = React.createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = React.useCallback(
    (item: Omit<ToastItem, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);
      const toast: ToastItem = { ...item, id };
      setToasts((prev) => [...prev, toast]);

      const duration = item.duration ?? 4500;
      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
      return id;
    },
    [removeToast],
  );

  const success = React.useCallback(
    (title: string, description?: string) => showToast({ type: 'success', title, description }),
    [showToast],
  );

  const warning = React.useCallback(
    (title: string, description?: string) => showToast({ type: 'warning', title, description }),
    [showToast],
  );

  const error = React.useCallback(
    (title: string, description?: string) => showToast({ type: 'error', title, description }),
    [showToast],
  );

  const info = React.useCallback(
    (title: string, description?: string) => showToast({ type: 'info', title, description }),
    [showToast],
  );

  return (
    <ToastContext.Provider
      value={{ toasts, showToast, removeToast, success, warning, error, info }}
    >
      {children}
      <ToastViewport toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

interface ToastViewportProps {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}

export function ToastViewport({ toasts, onRemove }: ToastViewportProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm sm:max-w-md w-full px-4 sm:px-0 pointer-events-none"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => onRemove(toast.id)} />
      ))}
    </div>
  );
}

interface ToastCardProps {
  toast: ToastItem;
  onDismiss: () => void;
}

function ToastCard({ toast, onDismiss }: ToastCardProps) {
  const icons = {
    success: <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />,
    error: <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />,
    info: <Info className="h-5 w-5 text-sky-600 shrink-0 mt-0.5" />,
  };

  const borders = {
    success: 'border-emerald-200 bg-white/95 text-slate-900 shadow-lg shadow-emerald-950/5',
    warning: 'border-amber-200 bg-white/95 text-slate-900 shadow-lg shadow-amber-950/5',
    error: 'border-rose-200 bg-white/95 text-slate-900 shadow-lg shadow-rose-950/5',
    info: 'border-sky-200 bg-white/95 text-slate-900 shadow-lg shadow-sky-950/5',
  };

  return (
    <div
      role="alert"
      className={cn(
        'pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl border backdrop-blur-md transition-all animate-in slide-in-from-bottom-3 duration-200 shadow-md',
        borders[toast.type],
      )}
    >
      {icons[toast.type]}
      <div className="flex-1 min-w-0 pr-1">
        <h4 className="text-xs font-bold leading-snug">{toast.title}</h4>
        {toast.description && (
          <p className="text-[11px] text-slate-600 font-medium leading-relaxed mt-0.5">
            {toast.description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

