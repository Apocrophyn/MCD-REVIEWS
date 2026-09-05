import { ArrowUpRight, Clock3, HelpCircle, History, Home, LockKeyhole, Settings, ShieldCheck, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { BrandMark, IconWell } from "./IconWell";

export type AppView = "home" | "quality" | "confirm" | "queue" | "settings";

interface Props {
  view: AppView;
  queueCount: number;
  historyOnly?: boolean;
  onNavigate: (view: AppView, history?: boolean) => void;
  children: ReactNode;
}

export function AppShell({ view, queueCount, historyOnly = false, onNavigate, children }: Props) {
  const inWorkflow = view === "quality" || view === "confirm";
  const pageName = view === "queue" ? historyOnly ? "History" : "Queue" : view === "settings" ? "Settings" : "Home";
  return (
    <div className={`app-shell ${inWorkflow ? "workflow-shell" : ""}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar" aria-label="Primary navigation">
        <button className="wordmark" onClick={() => onNavigate("home")} aria-label="Receipt Relay home">
          <BrandMark />
          <span>Receipt Relay</span>
        </button>
        <nav>
          <NavButton icon={<Home />} label="Home" active={view === "home" || inWorkflow} onClick={() => onNavigate("home")} />
          <NavButton icon={<Clock3 />} label="Queue" active={view === "queue" && !historyOnly} count={queueCount} onClick={() => onNavigate("queue")} />
          <NavButton icon={<History />} label="History" active={view === "queue" && historyOnly} onClick={() => onNavigate("queue", true)} />
        </nav>
        <nav className="sidebar-bottom">
          <NavButton icon={<Settings />} label="Settings" active={view === "settings"} onClick={() => onNavigate("settings")} />
          <a className="nav-button" href="https://www.mcdfoodforthoughts.com/" target="_blank" rel="noreferrer"><IconWell><HelpCircle /></IconWell><span>Survey help</span><ArrowUpRight className="nav-external" /></a>
        </nav>
        <div className="privacy-mini"><IconWell><ShieldCheck /></IconWell><span>Local, private<br /><small>You're in control</small></span></div>
      </aside>
      <div className="main-content">
        <header className="workspace-header">
          <div className="desktop-location"><span>Receipt Relay</span><span aria-hidden="true">/</span><strong>{pageName}</strong></div>
          <button className="mobile-brand" onClick={() => onNavigate("home")} aria-label="Receipt Relay home"><BrandMark /><strong>Receipt Relay</strong></button>
          <span className="workspace-private"><LockKeyhole aria-hidden="true" /><span>Private workspace</span></span>
        </header>
        <main id="main-content" tabIndex={-1}>{children}</main>
      </div>
      {!inWorkflow ? <nav className="bottom-nav" aria-label="Primary navigation">
        <NavButton icon={<Home />} label="Home" active={view === "home" || inWorkflow} onClick={() => onNavigate("home")} />
        <NavButton icon={<Clock3 />} label="Queue" active={view === "queue" && !historyOnly} count={queueCount} onClick={() => onNavigate("queue")} />
        <NavButton icon={<History />} label="History" active={view === "queue" && historyOnly} onClick={() => onNavigate("queue", true)} />
        <NavButton icon={<UserRound />} label="Privacy" active={view === "settings"} onClick={() => onNavigate("settings")} />
      </nav> : null}
    </div>
  );
}

function NavButton({ icon, label, active, count, onClick }: { icon: ReactNode; label: string; active: boolean; count?: number; onClick: () => void }) {
  return <button className={`nav-button ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} onClick={onClick}><IconWell>{icon}</IconWell><span>{label}</span>{count ? <b>{count}</b> : null}</button>;
}
