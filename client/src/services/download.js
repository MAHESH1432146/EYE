import api from './api.js';

// Authenticated download: the JWT travels in the header, so a plain link cannot be used.
export async function download(url, params, fallbackName) {
  const res = await api.get(url, { params, responseType: 'blob' });
  const cd = res.headers['content-disposition'] || '';
  const name = /filename="([^"]+)"/.exec(cd)?.[1] || fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = Object.assign(document.createElement('a'), { href, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
