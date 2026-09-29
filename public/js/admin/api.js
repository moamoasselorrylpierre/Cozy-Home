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

/** Téléverse une image déjà compressée (Blob) vers le stockage R2 ; renvoie son adresse. */
export async function upload(blob, folder) {
  const res = await fetch(`/api/admin/uploads?folder=${encodeURIComponent(folder)}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'CozyHome', 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new CustomEvent('admin:unauthorized'));
    throw new ApiError(res.status, data.error || 'Téléversement impossible.');
  }
  return data.url;
}
