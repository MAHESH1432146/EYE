import axios from 'axios';

export const TOKEN_KEY = 'foh_token';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api') });

export const getToken = () => localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
export const setToken = (token, remember) => {
  clearToken();
  (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
};
export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
};

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    const onAuthPage = window.location.pathname.startsWith('/login');
    if (error.response?.status === 401 && getToken() && !onAuthPage) {
      clearToken();
      window.location.assign('/login?expired=1');
    }
    return Promise.reject(error);
  }
);

export const errorMessage = (err) => err.response?.data?.message || err.message || 'Something went wrong';

export default api;
