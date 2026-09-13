'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { ToastContainer, ToastItem, ToastType } from '@/components/ui/Toast';

type ToastInput = string | { message: string; title?: string; duration?: number };

interface ToastContextType {
  toasts: ToastItem[];
  addToast: (type: ToastType, input: ToastInput) => string;
  removeToast: (id: string) => void;
  success: (input: ToastInput) => string;
  error: (input: ToastInput) => string;
  warning: (input: ToastInput) => string;
  info: (input: ToastInput) => string;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Standalone event dispatcher for singleton toast
type ToastListener = (type: ToastType, input: ToastInput) => string;
let globalToastListener: ToastListener | null = null;

export const toast = {
  success: (input: ToastInput) => globalToastListener ? globalToastListener('success', input) : '',
  error: (input: ToastInput) => globalToastListener ? globalToastListener('error', input) : '',
  warning: (input: ToastInput) => globalToastListener ? globalToastListener('warning', input) : '',
  info: (input: ToastInput) => globalToastListener ? globalToastListener('info', input) : '',
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((type: ToastType, input: ToastInput): string => {
    const id = Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    const item: ToastItem =
      typeof input === 'string'
        ? { id, type, message: input }
        : { id, type, message: input.message, title: input.title, duration: input.duration };

    setToasts((prev) => [...prev, item]);
    return id;
  }, []);

  const success = useCallback((input: ToastInput) => addToast('success', input), [addToast]);
  const error = useCallback((input: ToastInput) => addToast('error', input), [addToast]);
  const warning = useCallback((input: ToastInput) => addToast('warning', input), [addToast]);
  const info = useCallback((input: ToastInput) => addToast('info', input), [addToast]);

  useEffect(() => {
    globalToastListener = (type, input) => addToast(type, input);
    return () => {
      globalToastListener = null;
    };
  }, [addToast]);

  return (
    <ToastContext.Provider
      value={{
        toasts,
        addToast,
        removeToast,
        success,
        error,
        warning,
        info,
      }}
    >
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
