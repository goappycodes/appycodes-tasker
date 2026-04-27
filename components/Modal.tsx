"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Lightweight modal primitive — fixed overlay, centered card, ESC closes,
 * background click closes (unless `lockBackground` is set).
 */
export function Modal({
  open,
  onClose,
  children,
  title,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const widthClass = size === "sm" ? "max-w-md" : size === "lg" ? "max-w-3xl" : "max-w-xl";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-12 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`w-full ${widthClass} rounded-xl border border-border bg-surface shadow-2xl`}>
        {title && (
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="text-sm font-semibold">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-muted hover:bg-bg/40 hover:text-ink"
              aria-label="Close"
            >
              ×
            </button>
          </header>
        )}
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
