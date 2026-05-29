import { useState, useCallback } from 'react';

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

interface ToastState {
  toasts: Toast[];
}

let toastCount = 0;

export function useToast() {
  const [state, setState] = useState<ToastState>({ toasts: [] });

  const toast = useCallback(({ title, description, variant = 'default' }: Omit<Toast, 'id'>) => {
    const id = String(toastCount++);
    const newToast: Toast = { id, title, description, variant };
    
    setState((prev) => ({
      toasts: [...prev.toasts, newToast],
    }));

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setState((prev) => ({
        toasts: prev.toasts.filter((t) => t.id !== id),
      }));
    }, 5000);

    // Also log to console for debugging
    if (variant === 'destructive') {
      console.error(`[Toast] ${title}: ${description}`);
    } else {
      console.warn(`[Toast] ${title}: ${description}`);
    }

    return { id, dismiss: () => dismiss(id) };
  }, []);

  const dismiss = useCallback((toastId: string) => {
    setState((prev) => ({
      toasts: prev.toasts.filter((t) => t.id !== toastId),
    }));
  }, []);

  return {
    toast,
    toasts: state.toasts,
    dismiss,
  };
}

export { useToast as default };
