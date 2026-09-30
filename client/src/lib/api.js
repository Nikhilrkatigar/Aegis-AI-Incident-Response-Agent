import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export const api = axios.create({ baseURL: API_URL, timeout: 15_000 });

// Unwrap { success, data } and turn failures into one readable message (with the HTTP status kept).
api.interceptors.response.use(
  (res) => res.data.data,
  (err) => {
    const message = err.response?.data?.message
      || (err.code === 'ECONNABORTED' ? 'The server took too long to answer.' : "Can't reach the Aegis API. It may be waking up; try again in a few seconds.");
    const wrapped = new Error(message);
    wrapped.status = err.response?.status;
    return Promise.reject(wrapped);
  },
);
