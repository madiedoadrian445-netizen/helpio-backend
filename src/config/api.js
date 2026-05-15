// src/config/api.js
import AsyncStorage from "@react-native-async-storage/async-storage";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  "https://helpio-backend.onrender.com";

// FIX #7 — console.log removed. Never log the backend URL on app start.

/* ------------------------------------------------------------------
   FIX #53 — Token memory cache
   AsyncStorage.getItem is an async disk read — firing it on every
   API call adds latency to every request. Cache in memory after
   first read. Call clearTokenCache() on logout, setTokenCache() on login.
-------------------------------------------------------------------*/
let _cachedToken = null;

export const clearTokenCache = () => { _cachedToken = null; };
export const setTokenCache = (token) => { _cachedToken = token; };

async function getAuthHeader(passedToken) {
  if (passedToken) return { Authorization: `Bearer ${passedToken}` };
  if (_cachedToken) return { Authorization: `Bearer ${_cachedToken}` };

  const token = await AsyncStorage.getItem("token");
  if (token) _cachedToken = token;

  return token ? { Authorization: `Bearer ${token}` } : {};
}

/* ------------------------------------------------------------------
   FIX #5 — Timeout via AbortController (15s default)
   FIX #6 — HTTP error handling — throws on non-ok responses
-------------------------------------------------------------------*/
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${res.status}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  // FIX #4 — defaults.baseURL required by AllServicesScreen buildUrl()
  defaults: {
    baseURL: API_BASE_URL,
  },

  async get(path, passedToken = null) {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(await getAuthHeader(passedToken)),
    };
    return fetchWithTimeout(`${API_BASE_URL}${path}`, { method: "GET", headers });
  },

  async post(path, body = {}, passedToken = null) {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(await getAuthHeader(passedToken)),
    };
    return fetchWithTimeout(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  },

  async put(path, body = {}, passedToken = null) {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(await getAuthHeader(passedToken)),
    };
    return fetchWithTimeout(`${API_BASE_URL}${path}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
  },

  async del(path, passedToken = null) {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(await getAuthHeader(passedToken)),
    };
    return fetchWithTimeout(`${API_BASE_URL}${path}`, { method: "DELETE", headers });
  },

  async patch(path, body = {}, passedToken = null) {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(await getAuthHeader(passedToken)),
    };
    return fetchWithTimeout(`${API_BASE_URL}${path}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });
  },
};