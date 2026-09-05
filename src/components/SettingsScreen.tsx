import { AlertTriangle, Bot, Check, CheckCircle2, Database, ExternalLink, Eye, EyeOff, HardDrive, KeyRound, LoaderCircle, LockKeyhole, Monitor, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Health, ProviderOption, ProviderSettings } from "../types";
import { IconWell } from "./IconWell";

interface Props {
  health: Health | null;
  onHealthChange: () => void;
}

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "ok"; message: string; warning: string | null } | { kind: "error"; message: string };

export function SettingsScreen({ health, onHealthChange }: Props) {
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
  const [providerId, setProviderId] = useState("anthropic-oauth");
  const [token, setToken] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [revealToken, setRevealToken] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [showBrowser, setShowBrowser] = useState(false);

  const provider = useMemo<ProviderOption | null>(
    () => settings?.providers.find((entry) => entry.id === providerId) ?? null,
    [settings, providerId],
  );

  const load = () => api.providerSettings().then((result) => {
    setSettings(result);
    if (result.credential) {
      setProviderId(result.credential.providerId);
      setModel(result.credential.model);
      setBaseUrl(result.credential.baseUrl);
    }
  }).catch(() => undefined);

  useEffect(() => { void load(); }, []);
  useEffect(() => { setShowBrowser(health?.showBrowser ?? false); }, [health?.showBrowser]);

  const selectProvider = (id: string) => {
    setProviderId(id);
    const next = settings?.providers.find((entry) => entry.id === id);
    setModel(settings?.credential?.providerId === id ? settings.credential.model : next?.defaultModel ?? "");
    setBaseUrl(settings?.credential?.providerId === id ? settings.credential.baseUrl : next?.baseUrl ?? "");
    setStatus({ kind: "idle" });
  };

  const connect = async () => {
    setStatus({ kind: "busy" });
    try {
      const result = await api.saveCredential({ providerId, token: token.trim(), model: model.trim(), baseUrl: baseUrl.trim() });
      setStatus({ kind: "ok", message: `Connected to ${result.provider} using ${result.model}.`, warning: result.warning });
      setToken("");
      await load();
      onHealthChange();
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "The credential could not be saved" });
    }
  };

  const disconnect = async () => {
    setStatus({ kind: "busy" });
    try {
      await api.clearCredential();
      setToken("");
      setStatus({ kind: "idle" });
      await load();
      onHealthChange();
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "The credential could not be removed" });
    }
  };

  const toggleBrowser = async (next: boolean) => {
    setShowBrowser(next);
    await api.saveAutomationPreferences(next).catch(() => undefined);
    onHealthChange();
  };

  const connected = Boolean(settings?.credential);
  const visionModels = provider?.visionModels ?? [];

  return <div className="page settings-page">
    <header className="settings-header">
      <h1>Model &amp; setup</h1>
      <p>Connect the model that reads your receipts and writes your feedback. The credential is stored encrypted on this machine and never reaches the browser bundle.</p>
    </header>

    <div className="settings-layout">
      <section className="credential-section">
        <h2>Connect a model</h2>

        <div className="provider-grid" role="radiogroup" aria-label="Model provider">
          {settings?.providers.map((entry) => <button
            key={entry.id}
            role="radio"
            aria-checked={providerId === entry.id}
            className={providerId === entry.id ? "provider-card selected" : "provider-card"}
            onClick={() => selectProvider(entry.id)}
          >
            <strong>{entry.label}</strong>
            <small>{entry.supportsVision ? "Reads receipt photos" : "Text only — cannot read receipt photos"}</small>
            {settings.credential?.providerId === entry.id ? <em><CheckCircle2 /> Connected</em> : null}
          </button>)}
        </div>

        {provider ? <div className="credential-form">
          <p className="provider-notes">{provider.notes}</p>

          <label className="field-label" htmlFor="token">{provider.credentialLabel}</label>
          <div className="token-row">
            <input
              id="token"
              type={revealToken ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              value={token}
              placeholder={settings?.credential?.providerId === providerId ? settings.credential.maskedToken : provider.credentialHint}
              onChange={(event) => setToken(event.target.value)}
            />
            <button className="icon-button" type="button" onClick={() => setRevealToken((current) => !current)} aria-label={revealToken ? "Hide token" : "Show token"}>
              {revealToken ? <EyeOff /> : <Eye />}
            </button>
          </div>

          {providerId === "anthropic-oauth" ? <div className="settings-callout oauth-callout">
            <IconWell><KeyRound /></IconWell>
            <div>
              <strong>Getting a subscription token</strong>
              <p>Install the Claude Code CLI, run <code>claude setup-token</code>, sign in with the Claude account that holds your Pro or Max plan, and paste the <code>sk-ant-oat…</code> token it prints. Usage counts against your subscription limits rather than Console billing.</p>
            </div>
          </div> : null}

          <label className="field-label" htmlFor="model">Model</label>
          <input id="model" list="model-suggestions" value={model} onChange={(event) => setModel(event.target.value)} placeholder={provider.defaultModel || "Model id"} />
          <datalist id="model-suggestions">{visionModels.map((entry) => <option key={entry} value={entry} />)}</datalist>
          {visionModels.length ? <small className="field-hint">Vision-capable: {visionModels.join(", ")}</small> : null}

          {provider.editableBaseUrl ? <>
            <label className="field-label" htmlFor="base-url">Base URL</label>
            <input id="base-url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://your-endpoint/v1" />
          </> : null}

          <div className="credential-actions">
            <button className="primary-button" disabled={status.kind === "busy" || token.trim().length < 8} onClick={() => void connect()}>
              {status.kind === "busy" ? <LoaderCircle className="spin" /> : <ShieldCheck />}
              {status.kind === "busy" ? "Verifying…" : connected ? "Save and re-verify" : "Connect and verify"}
            </button>
            {connected ? <button className="secondary-button" disabled={status.kind === "busy"} onClick={() => void disconnect()}><Trash2 /> Disconnect</button> : null}
            {provider.docsUrl ? <a className="text-button" href={provider.docsUrl} target="_blank" rel="noreferrer">Get a key <ExternalLink /></a> : null}
          </div>

          {status.kind === "ok" ? <div className="credential-status ok" role="status"><CheckCircle2 /><div><strong>{status.message}</strong>{status.warning ? <small>{status.warning}</small> : null}</div></div> : null}
          {status.kind === "error" ? <div className="credential-status error" role="alert"><AlertTriangle /><span>{status.message}</span></div> : null}
          <small className="field-hint">Connecting sends one short test request so a bad key is caught here rather than halfway through a receipt.</small>
        </div> : null}
      </section>

      <section>
        <h2>Current environment</h2>
        <SettingRow
          icon={<Bot />}
          title="Receipt intelligence"
          value={health?.aiProvider ?? "Checking…"}
          detail={health?.analysisEnabled
            ? `${health.aiModel} — reading receipts and writing feedback${health.aiSource === "environment" ? " (from .env)" : ""}`
            : health?.feedbackEnabled
              ? `${health.aiModel} can write feedback but cannot read receipt photos. Connect a vision model to enable analysis.`
              : "No model connected. Receipt analysis and feedback are disabled; no sample data is ever substituted."}
        />
        <SettingRow icon={<HardDrive />} title="Receipt storage" value="Local" detail="Images, screenshots, and SQLite data stay under the private .data directory" />
        <SettingRow icon={<Database />} title="Survey automation" value={health ? health.automationEnabled ? health.surveyAutomator : "Not installed" : "Checking…"} detail={health?.automationEnabled ? "A private background browser reports progress back to Receipt Relay; no survey tab is opened" : "Install once with: npx playwright install chromium"} />
        <SettingRow icon={<KeyRound />} title="Credentials" value={settings?.credential ? "Encrypted locally" : "Not set"} detail="Sealed with AES-256-GCM under a key file only this machine can read. Never sent to the browser." />

        <label className="toggle-row">
          <IconWell><Monitor /></IconWell>
          <div><strong>Watch the survey browser</strong><small>Show the Chromium window while the survey runs instead of parking it off-screen. Useful for checking a run; slower and it steals focus.</small></div>
          <input type="checkbox" checked={showBrowser} onChange={(event) => void toggleBrowser(event.target.checked)} />
        </label>
      </section>

      <section>
        <h2>Safety promises</h2>
        <ul className="promise-list">
          <li><Check /> Receipt classification required before extraction</li>
          <li><Check /> Survey answers come only from confirmed fields</li>
          <li><Check /> Completion is only reported after answers were actually filled and a thank-you page was reached</li>
          <li><Check /> Every finished run stores a screenshot of the page it ended on</li>
          <li><Check /> A practice run stops at the submit button and submits nothing</li>
          <li><Check /> Automation stops on security checks or unknown required questions</li>
          <li><Check /> Feedback is checked against confirmed fact keys</li>
        </ul>
        <div className="settings-callout"><IconWell><ShieldCheck /></IconWell><div><strong>Your approval starts completion</strong><p>After you confirm that the answers are honest and accept the official terms, Receipt Relay fills and submits the survey in a rate-limited background browser.</p></div></div>
      </section>
    </div>

    <section className="resource-links">
      <h2>Official resources</h2>
      <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer"><Bot /> Anthropic Console API keys <ExternalLink /></a>
      <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer"><Bot /> OpenAI API keys <ExternalLink /></a>
      <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer"><Bot /> OpenRouter keys (Meta Llama) <ExternalLink /></a>
      <a href="https://www.mcdonalds.com/gb/en-gb/terms-and-conditions/food-for-thought-terms-conditions.html" target="_blank" rel="noreferrer"><LockKeyhole /> Current Food for Thoughts terms <ExternalLink /></a>
    </section>
  </div>;
}

function SettingRow({ icon, title, value, detail }: { icon: React.ReactNode; title: string; value: string; detail: string }) {
  return <div className="setting-row"><IconWell>{icon}</IconWell><div><strong>{title}</strong><small>{detail}</small></div><em>{value}</em></div>;
}
