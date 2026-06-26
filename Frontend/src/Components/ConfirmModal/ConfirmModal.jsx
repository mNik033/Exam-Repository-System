import React, { useState, useCallback, useRef, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { ConfirmContext } from "./ConfirmContext";

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);
  const modalRef = useRef(null);
  const previousActiveElementRef = useRef(null);

  const confirm = useCallback(({ title, message, confirmText = "Confirm", cancelText = "Cancel" }) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({ title, message, confirmText, cancelText });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolverRef.current?.(true);
    setState(null);
  }, []);

  const handleCancel = useCallback(() => {
    resolverRef.current?.(false);
    setState(null);
  }, []);

  useEffect(() => {
    if (state) {
      // Save the triggering element's focus
      previousActiveElementRef.current = document.activeElement;

      // Auto-focus the primary confirmation button on open
      setTimeout(() => {
        if (modalRef.current) {
          const focusable = modalRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (focusable.length > 0) {
            // Focus the confirm action (usually the last button)
            focusable[focusable.length - 1].focus();
          }
        }
      }, 50);

      const handleKeyDown = (e) => {
        if (e.key === "Escape") {
          handleCancel();
          return;
        }

        if (e.key === "Tab" && modalRef.current) {
          const focusable = Array.from(
            modalRef.current.querySelectorAll(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
          );
          if (focusable.length === 0) return;

          const firstElement = focusable[0];
          const lastElement = focusable[focusable.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === firstElement) {
              lastElement.focus();
              e.preventDefault();
            }
          } else {
            if (document.activeElement === lastElement) {
              firstElement.focus();
              e.preventDefault();
            }
          }
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        if (previousActiveElementRef.current) {
          previousActiveElementRef.current.focus();
        }
      };
    }
  }, [state, handleCancel]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="modal-backdrop animate-fade-in">
          <div
            ref={modalRef}
            className="animate-scale-in card-elevated modal-card"
          >
            <div className="warning-icon-circle">
              <AlertTriangle size={22} style={{ color: "var(--color-warning)" }} />
            </div>
            <h3 className="text-headline-small serif-heading page-header-title">
              {state.title}
            </h3>
            <p className="text-body-medium modal-message">
              {state.message}
            </p>
            <div className="modal-actions-row">
              <button
                className="btn-outlined btn-modal-action"
                onClick={handleCancel}
              >
                {state.cancelText}
              </button>
              <button
                className="btn-filled btn-modal-action"
                onClick={handleConfirm}
              >
                {state.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

