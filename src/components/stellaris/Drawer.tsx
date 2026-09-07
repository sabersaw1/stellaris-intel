import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/** Right-hand contextual drawer. Old standalone pages are reachable here without occupying primary navigation. */
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="h-full w-full max-w-3xl overflow-y-auto border-l border-border bg-background/95 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 -mx-4 mb-3 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 pb-2">
          <h2 className="display text-sm tracking-[0.18em] text-foreground">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}
