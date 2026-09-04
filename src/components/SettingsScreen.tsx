import { Bot, Check, Database, ExternalLink, HardDrive, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import type { Health } from "../types";

export function SettingsScreen({ health }: { health: Health | null }) {
  return <div className="page settings-page">
    <header className="settings-header"><h1>Privacy &amp; setup</h1><p>Receipt Relay keeps receipt processing and survey automation on your local server.</p></header>
    <div className="settings-layout">
      <section><h2>Current environment</h2>
        <SettingRow icon={<Bot />} title="Receipt intelligence" value={health?.aiProvider ?? "Checking…"} detail={health?.analysisEnabled ? "Official Anthropic API, called by the server" : "Disabled until a Console API key is configured; no fake extraction fallback"} />
        <SettingRow icon={<HardDrive />} title="Receipt storage" value="Local" detail="Images and SQLite data stay under the private .data directory" />
        <SettingRow icon={<Database />} title="Survey automation" value={health ? health.automationEnabled ? health.surveyAutomator : "Not installed" : "Checking…"} detail={health?.automationEnabled ? "A private background browser reports progress back to Receipt Relay; no survey tab is opened" : "Install once with: npx playwright install chromium"} />
        <SettingRow icon={<KeyRound />} title="Credentials" value="Server only" detail="API keys are never included in browser code or responses" />
      </section>
      <section><h2>Safety promises</h2>
        <ul className="promise-list"><li><Check /> Receipt classification required before extraction</li><li><Check /> No claude.ai cookies or subscription tokens</li><li><Check /> Survey answers come only from confirmed fields</li><li><Check /> Automation stops on security checks or unknown required questions</li><li><Check /> Feedback is checked against confirmed fact keys</li></ul>
        <div className="settings-callout"><ShieldCheck /><div><strong>Your approval starts completion</strong><p>After you confirm that the answers are honest and accept the official terms, Receipt Relay fills and submits the survey in a rate-limited background browser.</p></div></div>
      </section>
    </div>
    <section className="resource-links"><h2>Official resources</h2><a href="https://support.anthropic.com/en/articles/9876003-i-subscribe-to-a-paid-claude-ai-plan-why-do-i-have-to-pay-separately-for-api-usage-on-console" target="_blank" rel="noreferrer"><Bot /> Anthropic API and subscriptions <ExternalLink /></a><a href="https://www.mcdonalds.com/gb/en-gb/terms-and-conditions/food-for-thought-terms-conditions.html" target="_blank" rel="noreferrer"><LockKeyhole /> Current Food for Thoughts terms <ExternalLink /></a></section>
  </div>;
}

function SettingRow({ icon, title, value, detail }: { icon: React.ReactNode; title: string; value: string; detail: string }) {
  return <div className="setting-row"><span>{icon}</span><div><strong>{title}</strong><small>{detail}</small></div><em>{value}</em></div>;
}
