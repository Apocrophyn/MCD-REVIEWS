import type { AutomationJob, Employee, Experience, Health, Receipt, SurveyPreparation } from "../types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Request failed" })) as { error?: string };
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  health: () => request<Health>("/api/health"),
  listReceipts: () => request<{ receipts: Receipt[] }>("/api/receipts"),
  getReceipt: (id: string) => request<{ receipt: Receipt }>(`/api/receipts/${id}`),
  upload: (files: File[]) => {
    const data = new FormData();
    files.forEach((file) => data.append("images", file));
    return request<{ receipt: Receipt }>("/api/receipts", { method: "POST", body: data });
  },
  analyze: (id: string) => request<{ receipt: Receipt }>(`/api/receipts/${id}/analyze`, { method: "POST" }),
  update: (id: string, body: Partial<Receipt>) => request<{ receipt: Receipt }>(`/api/receipts/${id}`, json("PATCH", body)),
  feedback: (id: string, body: Experience) => request<{ receipt: Receipt }>(`/api/receipts/${id}/feedback`, json("POST", body)),
  approve: (id: string) => request<{ receipt: Receipt; preparation: SurveyPreparation }>(`/api/receipts/${id}/approve`, { method: "POST" }),
  schedule: (id: string, scheduledAt: string) => request<{ receipt: Receipt }>(`/api/receipts/${id}/schedule`, json("POST", { scheduledAt })),
  complete: (id: string) => request<{ receipt: Receipt }>(`/api/receipts/${id}/complete`, { method: "POST" }),
  automation: (id: string) => request<{ job: AutomationJob }>(`/api/receipts/${id}/automation`, { method: "POST" }),
  automationJob: (id: string) => request<{ job: AutomationJob }>(`/api/automation/jobs/${id}`),
  latestAutomation: (receiptId: string) => request<{ job: AutomationJob | null }>(`/api/receipts/${receiptId}/automation/latest`),
  cancel: (id: string) => request<{ receipt: Receipt }>(`/api/receipts/${id}/cancel`, { method: "POST" }),
  archive: (id: string) => request<{ receipt: Receipt }>(`/api/receipts/${id}/archive`, { method: "POST" }),
  delete: (id: string) => request<void>(`/api/receipts/${id}`, { method: "DELETE" }),
  listEmployees: (query = "") => request<{ employees: Employee[] }>(`/api/employees?q=${encodeURIComponent(query)}`),
  createEmployee: (body: { name: string; role: string }) => request<{ employee: Employee }>("/api/employees", json("POST", body)),
};

export const imageUrl = (receiptId: string, imageId: string) => `/api/receipts/${receiptId}/images/${imageId}`;
