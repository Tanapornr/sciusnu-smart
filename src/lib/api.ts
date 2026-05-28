const BASE = import.meta.env.VITE_API_URL ?? "";

async function request<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const json = await res.json();
  if (json.status === "error") throw new Error(json.message);
  return json as T;
}

export const api = {
  login: (username: string, password: string) =>
    request("/api/auth", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  getData: (studentId?: string) =>
    request(`/api/data${studentId ? `?studentId=${encodeURIComponent(studentId)}` : ""}`),

  getUploadUrl: (fileName: string, mimeType: string) =>
    request<{ status: string; uploadUrl: string }>("/api/drive-upload-url", {
      method: "POST",
      body: JSON.stringify({ fileName, mimeType }),
    }),

  submitWork: (payload: import("../types").SubmitPayload) =>
    request("/api/submit", { method: "POST", body: JSON.stringify(payload) }),

  updateStatus: (payload: import("../types").StatusPayload) =>
    request("/api/status", { method: "POST", body: JSON.stringify(payload) }),

  updateProfile: (payload: import("../types").ProfilePayload) =>
    request("/api/profile", { method: "POST", body: JSON.stringify(payload) }),

  updateAdvisorPassword: (payload: import("../types").AdvisorPasswordPayload) =>
    request("/api/advisor-password", { method: "POST", body: JSON.stringify(payload) }),
};