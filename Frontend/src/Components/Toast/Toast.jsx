import React, { useState, useCallback, useMemo, useRef } from "react";
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { ToastContext } from "./ToastContext";

const TOAST_STYLES = {
  success: {
    bg: "var(--color-success-container)",
    icon: "var(--color-success)",
    text: "var(--md-on-surface)",
    close: "var(--md-on-surface-variant)",
  },
  warning: {
    bg: "var(--color-warning-container)",
    icon: "var(--color-warning)",
    text: "var(--md-on-surface)",
    close: "var(--md-on-surface-variant)",
  },
  error: {
    bg: "var(--md-error-container)",
    icon: "var(--md-error)",
    text: "var(--md-on-error-container)",
    close: "var(--md-on-error-container)",
  },
  info: {
    bg: "var(--md-primary-container)",
    icon: "var(--md-on-primary-container)",
    text: "var(--md-on-primary-container)",
    close: "var(--md-on-primary-container)",
  },
};

const TOAST_ICONS = { success: CheckCircle, warning: AlertTriangle, error: AlertCircle, info: Info };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toastIdCounter = useRef(0);

  const addToast = useCallback((message, type = "info", duration = 4000) => {
    toastIdCounter.current += 1;
    const id = toastIdCounter.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
    }
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toastMethods = useMemo(() => ({
    success: (msg, dur) => addToast(msg, "success", dur),
    error: (msg, dur) => addToast(msg, "error", dur),
    warning: (msg, dur) => addToast(msg, "warning", dur),
    info: (msg, dur) => addToast(msg, "info", dur),
  }), [addToast]);

  return (
    <ToastContext.Provider value={toastMethods}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => {
          const Icon = TOAST_ICONS[t.type];
          const style = TOAST_STYLES[t.type];
          return (
            <div
              key={t.id}
              className="animate-slide-in-right toast-item"
              style={{
                background: style.bg,
                color: style.text,
              }}
            >
              <Icon size={20} className="toast-icon" style={{ color: style.icon }} />
              <span className="toast-message">{t.message}</span>
              <button
                onClick={() => removeToast(t.id)}
                className="opacity-70 hover:opacity-100 transition-opacity toast-close-btn"
                style={{
                  color: style.close,
                }}
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

