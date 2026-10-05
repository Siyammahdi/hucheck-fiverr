import { CheckIcon, CopyIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Height-animates its children in and out, and keeps them out of the tab order while closed. */
export function Collapse({ open, className, children }: { open: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div
      aria-hidden={!open}
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-250 ease-smooth",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        className
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/** Copy icon that cross-fades into a check mark. */
export function CopyGlyph({ copied }: { copied: boolean }) {
  const base = "absolute inset-0 size-4 transition-[opacity,scale] duration-200 ease-smooth";
  return (
    <span className="relative size-4">
      <CopyIcon className={cn(base, copied ? "scale-50 opacity-0" : "scale-100 opacity-100")} />
      <CheckIcon className={cn(base, copied ? "scale-100 opacity-100" : "scale-50 opacity-0")} />
    </span>
  );
}
