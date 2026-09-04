import { Clock3, HelpCircle, History, Home, ListChecks, Settings, UserRound } from "lucide-react";
import type { ReactNode } from "react";

export type AppView = "home" | "quality" | "confirm" | "queue" | "settings";

interface Props {
  view: AppView;
  queueCount: number;
  onNavigate: (view: AppView, history?: boolean) => void;
  children: ReactNode;
}

export function AppShell({ view, queueCount, onNavigate, children }: Props) {
  const inWorkflow = view === "quality" || view === "confirm";
  return (
    <div className={`app-shell ${inWorkflow ? "workflow-shell" : ""}`}>
      <aside className="sidebar" aria-label="Primary navigation">
        <button className="wordmark" onClick={() => onNavigate("home")} aria-label="Receipt Relay home">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>Receipt Relay</span>
        </button>
        <nav>
          <NavButton icon={<Home />} label="Home" active={view === "home" || inWorkflow} onClick={() => onNavigate("home")} />
          <NavButton icon={<Clock3 />} label="Queue" active={view === "queue"} count={queueCount} onClick={() => onNavigate("queue")} />
          <NavButton icon={<History />} label="History" active={false} onClick={() => onNavigate("queue", true)} />
        </nav>
        <nav className="sidebar-bottom">
          <NavButton icon={<Settings />} label="Settings" active={view === "settings"} onClick={() => onNavigate("settings")} />
          <a className="nav-button" href="https://www.mcdfoodforthoughts.com/" target="_blank" rel="noreferrer"><HelpCircle /> <span>Survey help</span></a>
        </nav>
        <div className="privacy-mini"><ListChecks /><span>Local, private<br /><small>You're in control</small></span></div>
      </aside>
      <main className="main-content">{children}</main>
      {!inWorkflow ? <nav className="bottom-nav" aria-label="Primary navigation">
        <NavButton icon={<Home />} label="Home" active={view === "home" || inWorkflow} onClick={() => onNavigate("home")} />
        <NavButton icon={<Clock3 />} label="Queue" active={view === "queue"} count={queueCount} onClick={() => onNavigate("queue")} />
        <NavButton icon={<History />} label="History" active={false} onClick={() => onNavigate("queue", true)} />
        <NavButton icon={<UserRound />} label="Privacy" active={view === "settings"} onClick={() => onNavigate("settings")} />
      </nav> : null}
    </div>
  );
}

function NavButton({ icon, label, active, count, onClick }: { icon: ReactNode; label: string; active: boolean; count?: number; onClick: () => void }) {
  return <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}>{icon}<span>{label}</span>{count ? <b>{count}</b> : null}</button>;
}
