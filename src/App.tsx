import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppShell, type AppView } from "./components/AppShell";
import { QualityScreen } from "./components/QualityScreen";
import { QueueScreen } from "./components/QueueScreen";
import { ReceiptEditor } from "./components/ReceiptEditor";
import { SettingsScreen } from "./components/SettingsScreen";
import { UploadScreen } from "./components/UploadScreen";
import { api } from "./lib/api";
import type { AutomationJob, Experience, Health, Receipt } from "./types";

interface Notice { type: "success" | "error"; message: string }

export default function App() {
  const [view, setView] = useState<AppView>("home");
  const [historyOnly, setHistoryOnly] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [activeReceipt, setActiveReceipt] = useState<Receipt | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [automationJob, setAutomationJob] = useState<AutomationJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const refresh = useCallback(async () => {
    const { receipts: result } = await api.listReceipts();
    setReceipts(result);
  }, []);

  useEffect(() => {
    Promise.all([api.health(), api.listReceipts()]).then(([healthResult, receiptResult]) => {
      setHealth(healthResult);
      setReceipts(receiptResult.receipts);
    }).catch((error: Error) => setNotice({ type: "error", message: error.message }));
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!automationJob || !["queued", "running"].includes(automationJob.status)) return;
    let canceled = false;
    const timer = window.setTimeout(async () => {
      try {
        const { job } = await api.automationJob(automationJob.id);
        if (canceled) return;
        setAutomationJob(job);
        if (job.status === "completed") {
          setNotice({ type: "success", message: "Food for Thoughts survey completed in the background" });
          if (activeReceipt?.id === job.receiptId) {
            const { receipt } = await api.getReceipt(activeReceipt.id);
            if (!canceled) setActiveReceipt(receipt);
          }
          await refresh();
        } else if (["failed", "needs_attention"].includes(job.status)) {
          setNotice({ type: "error", message: job.message });
        }
      } catch (error) {
        if (!canceled) setNotice({ type: "error", message: error instanceof Error ? error.message : "Could not check survey progress" });
      }
    }, 1_200);
    return () => { canceled = true; window.clearTimeout(timer); };
  }, [automationJob, activeReceipt, refresh]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); }
    catch (error) { setNotice({ type: "error", message: error instanceof Error ? error.message : "Something went wrong" }); }
    finally { setBusy(false); }
  };

  const navigate = (next: AppView, history = false) => {
    setView(next);
    setHistoryOnly(history);
    if (next === "home" || next === "queue" || next === "settings") setActiveReceipt(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openReceipt = (receipt: Receipt) => {
    setActiveReceipt(receipt);
    setView(receipt.status === "quality_review" || receipt.classification?.isReceipt === false || (receipt.status === "failed" && !receipt.store) ? "quality" : "confirm");
    if (!automationJob || !["queued", "running"].includes(automationJob.status)) {
      void api.latestAutomation(receipt.id).then(({ job }) => setAutomationJob(job)).catch(() => undefined);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const upload = (files: File[]) => void run(async () => {
    const { receipt } = await api.upload(files);
    setActiveReceipt(receipt);
    setView("quality");
    await refresh();
    setNotice({ type: "success", message: `${files.length} image${files.length === 1 ? "" : "s"} checked and stored privately` });
  });

  const analyze = () => activeReceipt && void run(async () => {
    const { receipt } = await api.analyze(activeReceipt.id);
    setActiveReceipt(receipt);
    setView(receipt.classification?.isReceipt === false || receipt.status === "failed" ? "quality" : "confirm");
    await refresh();
  });

  const discardCapture = () => activeReceipt && void run(async () => {
    await api.delete(activeReceipt.id);
    await refresh();
    navigate("home");
  });

  const save = async (update: Partial<Receipt>) => {
    if (!activeReceipt) return;
    await run(async () => {
      const { receipt } = await api.update(activeReceipt.id, update);
      setActiveReceipt(receipt);
      await refresh();
      setNotice({ type: "success", message: "Draft saved" });
    });
  };

  const generate = async (update: Partial<Receipt>, experience: Experience) => {
    if (!activeReceipt) return;
    await run(async () => {
      await api.update(activeReceipt.id, update);
      const { receipt } = await api.feedback(activeReceipt.id, experience);
      setActiveReceipt(receipt);
      await refresh();
      setNotice({ type: "success", message: "Grounded draft ready for your review" });
    });
  };

  const approve = async (update: Partial<Receipt>, experience: Experience, feedback: string) => {
    if (!activeReceipt) return;
    await run(async () => {
      await api.update(activeReceipt.id, { ...update, experience, feedback });
      if (!feedback.trim()) await api.feedback(activeReceipt.id, experience);
      const result = await api.approve(activeReceipt.id);
      setActiveReceipt(result.receipt);
      const { job } = await api.automation(activeReceipt.id);
      setAutomationJob(job);
      await refresh();
      setNotice({ type: "success", message: "Survey is now running in the background" });
    });
  };

  const remove = async () => {
    if (!activeReceipt || !window.confirm("Delete this receipt and every stored image? This cannot be undone.")) return;
    await run(async () => {
      await api.delete(activeReceipt.id);
      await refresh();
      navigate("home");
      setNotice({ type: "success", message: "Receipt and images deleted" });
    });
  };

  const retry = (receipt: Receipt) => void run(async () => {
    const result = await api.analyze(receipt.id);
    setActiveReceipt(result.receipt);
    setView(result.receipt.classification?.isReceipt === false || result.receipt.status === "failed" ? "quality" : "confirm");
    await refresh();
  });

  const cancel = (receipt: Receipt) => void run(async () => {
    await api.cancel(receipt.id);
    await refresh();
    setNotice({ type: "success", message: "Queue item canceled" });
  });

  const archive = (receipt: Receipt) => void run(async () => {
    await api.archive(receipt.id);
    await refresh();
    setNotice({ type: "success", message: "Completed receipt archived" });
  });

  const queueCount = receipts.filter((receipt) => !["completed", "canceled"].includes(receipt.status)).length;

  return <AppShell view={view} queueCount={queueCount} onNavigate={navigate}>
    {view === "home" ? <UploadScreen receipts={receipts} health={health} busy={busy} onUpload={upload} onOpen={openReceipt} onQueue={() => navigate("queue")} /> : null}
    {view === "quality" && activeReceipt ? <QualityScreen receipt={activeReceipt} busy={busy} analysisEnabled={health?.analysisEnabled ?? false} onBack={() => navigate("home")} onAnalyze={analyze} onRetake={discardCapture} /> : null}
    {view === "confirm" && activeReceipt ? <ReceiptEditor key={activeReceipt.id} receipt={activeReceipt} busy={busy} automationJob={automationJob?.receiptId === activeReceipt.id ? automationJob : null} onBack={() => navigate("queue")} onSave={save} onGenerate={generate} onApprove={approve} onDelete={remove} /> : null}
    {view === "queue" ? <QueueScreen receipts={receipts} historyOnly={historyOnly} busy={busy} onOpen={openReceipt} onRetry={retry} onCancel={cancel} onArchive={archive} /> : null}
    {view === "settings" ? <SettingsScreen health={health} /> : null}
    {notice ? <div className={`toast toast-${notice.type}`} role="status">{notice.type === "success" ? <CheckCircle2 /> : <AlertCircle />}<span>{notice.message}</span><button onClick={() => setNotice(null)} aria-label="Dismiss"><X /></button></div> : null}
  </AppShell>;
}
