// Appels à l'API d'administration (cookie de session + en-tête anti-CSRF).
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/admin${path}`, {
    method,
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'CozyHome', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new ApiError(res.status, data.error || 'Une erreur est survenue.');
    if (res.status === 401 && path !== '/login') window.dispatchEvent(new CustomEvent('admin:unauthorized'));
    throw err;
  }
  return data;
}

export const upload = (dataUrl, folder) => api('/uploads', { method: 'POST', body: { dataUrl, folder } }).then((r) => r.url);
