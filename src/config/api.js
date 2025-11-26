// src/config/api.js

export const API_BASE_URL = "https://helpio-backend.onrender.com";

export const api = {
  async get(path, token = null) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
    return res.json();
  },

  async post(path, body = {}, token = null) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    });
    return res.json();
  },

  async put(path, body = {}, token = null) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    });
    return res.json();
  },

  async del(path, token = null) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
    return res.json();
  }
};
