// Thin fetch wrapper. Auth lives in an httpOnly cookie; the custom header is required by the server for writes (CSRF defence).
export class ApiError extends Error { constructor(status, message, data) { super(message); this.status = status; this.data = data; } }

async function request(method, url, body, opts = {}) {
  const headers = { 'X-Requested-With': 'tal-ems' };
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`/api${url}`, { method, headers, body: payload, credentials: 'same-origin' });
  if (opts.raw) { if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))).error || 'خطأ'); return res; }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/auth/login') && !url.startsWith('/auth/me')) window.dispatchEvent(new Event('tal:unauthorized'));
  if (!res.ok) throw new ApiError(res.status, data.error || 'حدث خطأ غير متوقع', data);
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b ?? {}),
  put: (u, b) => request('PUT', u, b ?? {}),
  del: (u) => request('DELETE', u),
  upload: async (file) => { const fd = new FormData(); fd.append('file', file); return request('POST', '/files', fd); },
  download: async (url, filename) => {
    const res = await request('GET', url, undefined, { raw: true });
    const blob = await res.blob(); const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
};

export const qs = (obj) => {
  const p = new URLSearchParams();
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    if (typeof v === 'object') Object.entries(v).forEach(([kk, vv]) => { if (vv !== '' && vv != null) p.append(`${k}[${kk}]`, vv); });
    else p.append(k, v);
  });
  const s = p.toString(); return s ? `?${s}` : '';
};
