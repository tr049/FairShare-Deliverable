// Central API client. Every call here matches docs/api-contract.md exactly.
// Base URL: Express backend on 3001 (node-react profile, local data layer).

const BASE_URL = "http://localhost:3001";
const TOKEN_KEY = "fairshare_token";

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// auth: attach the Bearer token (protected calls). redirectOn401: on a 401,
// drop the session and send the user to /login. Session restore opts out so
// a stale token on app load degrades quietly instead of bouncing the page.
async function request(path, { method = "GET", body, auth = true, redirectOn401 = true } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(BASE_URL + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network_error", "Cannot reach the server — is the backend running on port 3001?");
  }

  if (res.status === 204) return null;

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    if (res.status === 401 && auth) {
      clearToken();
      if (redirectOn401) window.location.assign("/login");
    }
    throw new ApiError(
      res.status,
      (data && data.error) || "error",
      (data && data.message) || "Something went wrong."
    );
  }

  return data;
}

export const api = {
  // auth
  signup: (name, email, password) =>
    request("/auth/signup", { method: "POST", body: { name, email, password }, auth: false }),
  login: (email, password) =>
    request("/auth/login", { method: "POST", body: { email, password }, auth: false }),
  me: () => request("/auth/me", { redirectOn401: false }),
  updateMe: (name) => request("/auth/me", { method: "PUT", body: { name } }),
  changePassword: (currentPassword, newPassword) =>
    request("/auth/me/password", {
      method: "PUT",
      body: { current_password: currentPassword, new_password: newPassword },
    }),

  // groups
  listGroups: () => request("/groups"),
  createGroup: (name) => request("/groups", { method: "POST", body: { name } }),
  getGroup: (groupId) => request(`/groups/${groupId}`),
  updateGroup: (groupId, changes) => request(`/groups/${groupId}`, { method: "PUT", body: changes }),
  deleteGroup: (groupId) => request(`/groups/${groupId}`, { method: "DELETE" }),

  // members
  addMember: (groupId, email) =>
    request(`/groups/${groupId}/members`, { method: "POST", body: { email } }),
  removeMember: (groupId, userId) =>
    request(`/groups/${groupId}/members/${userId}`, { method: "DELETE" }),

  // expenses
  listExpenses: (groupId) => request(`/groups/${groupId}/expenses`),
  createExpense: (groupId, body) => request(`/groups/${groupId}/expenses`, { method: "POST", body }),
  getExpense: (groupId, expenseId) => request(`/groups/${groupId}/expenses/${expenseId}`),
  updateExpense: (groupId, expenseId, body) =>
    request(`/groups/${groupId}/expenses/${expenseId}`, { method: "PUT", body }),
  deleteExpense: (groupId, expenseId) =>
    request(`/groups/${groupId}/expenses/${expenseId}`, { method: "DELETE" }),

  // balances
  getGroupBalances: (groupId) => request(`/groups/${groupId}/balances`),
  getOverallBalances: () => request("/balances/overall"),

  // settlements
  listSettlements: (groupId) => request(`/groups/${groupId}/settlements`),
  createSettlement: (groupId, body) =>
    request(`/groups/${groupId}/settlements`, { method: "POST", body }),
  deleteSettlement: (groupId, settlementId) =>
    request(`/groups/${groupId}/settlements/${settlementId}`, { method: "DELETE" }),

  // activity
  getActivity: (groupId) => request(`/groups/${groupId}/activity`),

  // export — the contract's one non-JSON success response (text/csv). Fetched
  // as a blob with the Bearer token so the download works on a protected
  // route; the filename comes from Content-Disposition when the browser is
  // allowed to read it (the caller falls back to a slug otherwise).
  exportCsv: async (groupId) => {
    const headers = {};
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(`${BASE_URL}/groups/${groupId}/export`, { headers });
    } catch {
      throw new ApiError(0, "network_error", "Cannot reach the server — is the backend running on port 3001?");
    }

    if (!res.ok) {
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (res.status === 401) {
        clearToken();
        window.location.assign("/login");
      }
      throw new ApiError(
        res.status,
        (data && data.error) || "error",
        (data && data.message) || "Export failed."
      );
    }

    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    return { blob, filename: match ? match[1] : null };
  },
};
