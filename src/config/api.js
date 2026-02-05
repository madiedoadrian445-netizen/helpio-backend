// src/config/api.js
import AsyncStorage from "@react-native-async-storage/async-storage";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  "https://floors-procedures-flows-jimmy.trycloudflare.com";

console.log(
  "🔗 API Base URL (fetch api.js) =>",
  process.env.EXPO_PUBLIC_API_URL,
  "| resolved =>",
  API_BASE_URL
);

/* ------------------------------------------------------------------
   Automatically loads the auth token from AsyncStorage for all calls
-------------------------------------------------------------------*/
async function getAuthHeader(passedToken) {
  const token = passedToken || (await AsyncStorage.getItem("authToken"));

  return token
    ? { Authorization: `Bearer ${token}` }
    : {};
}

export const api = {
  async get(path, passedToken = null) {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(await getAuthHeader(passedToken)),
    };

    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      headers,
    });

    return res.json();
  },

  async post(path, body = {}, passedToken = null) {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(await getAuthHeader(passedToken)),
    };

    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    return res.json();
  },

  async put(path, body = {}, passedToken = null) {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(await getAuthHeader(passedToken)),
    };

    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });

    return res.json();
  },

  async del(path, passedToken = null) {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(await getAuthHeader(passedToken)),
    };

    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "DELETE",
      headers,
    });

    return res.json();
  },
};