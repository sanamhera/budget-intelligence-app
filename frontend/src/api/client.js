const API = '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

/* ─────────────────────────────────────────────────────────────
   auditLog — fire-and-forget, never throws, safe to call anywhere
───────────────────────────────────────────────────────────── */
export async function auditLog({ user, module: mod, action, recordId, oldValue, newValue }) {
  try {
    const token = getToken();
    await fetch(`${API}/audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        user:      user?.name || user?.email || 'Unknown',
        module:    mod,
        action,
        recordId:  recordId || null,
        oldValue:  oldValue != null ? JSON.stringify(oldValue)  : null,
        newValue:  newValue != null ? JSON.stringify(newValue)  : null,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch { /* audit failure must never break the UI */ }
}

export const api = {
  auth: {
    login:    (email, password) => request('/auth/login',    { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: (body)            => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
    me:       ()                => request('/auth/me'),
  },

  budgets: {
    list:   ()           => request('/budgets'),
    get:    (id)         => request(`/budgets/${id}`),
    create: (body)       => request('/budgets',      { method: 'POST',   body: JSON.stringify(body) }),
    update: (id, body)   => request(`/budgets/${id}`,{ method: 'PATCH',  body: JSON.stringify(body) }),
    delete: (id)         => request(`/budgets/${id}`,{ method: 'DELETE' }),
  },

  invoices: {
    list:    (budgetId)  => request(budgetId ? `/invoices?budgetId=${budgetId}` : '/invoices'),
    get:     (id)        => request(`/invoices/${id}`),
    create:  (body)      => request('/invoices',        { method: 'POST',   body: JSON.stringify(body) }),
    update:  (id, body)  => request(`/invoices/${id}`,  { method: 'PATCH',  body: JSON.stringify(body) }),
    delete:  (id)        => request(`/invoices/${id}`,  { method: 'DELETE' }),
    confirm: (body)      => request('/invoices/confirm',{ method: 'POST',   body: JSON.stringify(body) }),
    upload:  (file, budgetId) => {
      const form = new FormData();
      form.append('file', file);
      form.append('budgetId', budgetId);
      const token = getToken();
      return fetch(`${API}/invoices/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      }).then(r =>
        r.ok ? r.json() : r.json().then(d => Promise.reject(new Error(d.error || 'Upload failed')))
      );
    },
  },

  payments: {
    list:   (invoiceId)  => request(invoiceId ? `/payments?invoiceId=${invoiceId}` : '/payments'),
    create: (body)       => request('/payments',       { method: 'POST',   body: JSON.stringify(body) }),
    update: (id, body)   => request(`/payments/${id}`, { method: 'PATCH',  body: JSON.stringify(body) }),
    delete: (id)         => request(`/payments/${id}`, { method: 'DELETE' }),
  },

  // renamed from api.approvals → api.nfaTracker; backend route: /api/nfa-tracker
  nfaTracker: {
    list:    (status)    => request(status ? `/nfa-tracker?status=${status}` : '/nfa-tracker'),
    get:     (id)        => request(`/nfa-tracker/${id}`),
    create:  (body)      => request('/nfa-tracker',                { method: 'POST',  body: JSON.stringify(body) }),
    update:  (id, body)  => request(`/nfa-tracker/${id}`,          { method: 'PATCH', body: JSON.stringify(body) }),
    delete:  (id)        => request(`/nfa-tracker/${id}`,          { method: 'DELETE' }),
    submit:  (id)        => request(`/nfa-tracker/${id}/submit`,   { method: 'POST' }),
    approve: (id, body)  => request(`/nfa-tracker/${id}/approve`,  { method: 'POST',  body: JSON.stringify(body) }),
  },

  dashboard: {
    get:       () => request('/dashboard'),
    summary:   () => request('/dashboard/summary'),
    analytics: () => request('/dashboard/analytics'),
  },

  gl: {
    list: () => request('/gl'),
  },

  audit: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(q ? `/audit?${q}` : '/audit');
    },
  },

  // Excel export — returns raw Blob for download
  export: {
    budgets: () => {
      const token = getToken();
      return fetch(`${API}/export/budgets`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then(r => r.ok ? r.blob() : Promise.reject(new Error('Export failed')));
    },
    opexCapex: () => {
      const token = getToken();
      return fetch(`${API}/export/opex-capex`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then(r => r.ok ? r.blob() : Promise.reject(new Error('Export failed')));
    },
  },
};