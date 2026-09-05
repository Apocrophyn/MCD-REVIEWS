import type { ReactNode } from "react";

export function IconWell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`icon-well ${className}`} aria-hidden="true">{children}</span>;
}

export function BrandMark() {
  return <IconWell className="brand-mark"><img src="/receipt-relay.svg" alt="" width="28" height="28" /></IconWell>;
}
