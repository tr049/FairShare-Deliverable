import { createContext, useContext, useEffect, useState } from "react";
import { api, ApiError, getToken, setToken, clearToken } from "../api.js";

// Session context for the local data layer: the backend's /auth endpoints
// issue a JWT, we keep it in localStorage, and GET /auth/me restores the
// session on app load so a reload keeps the user signed in.

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then((data) => setUser(data.user))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) clearToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function signup(name, email, password) {
    const data = await api.signup(name, email, password);
    setToken(data.access_token);
    setUser(data.user);
  }

  async function login(email, password) {
    const data = await api.login(email, password);
    setToken(data.access_token);
    setUser(data.user);
  }

  // PUT /auth/me, then update the context so the new display name renders
  // everywhere immediately (header, profile) without a reload.
  async function updateProfile(name) {
    const data = await api.updateMe(name);
    setUser(data.user);
    return data.user;
  }

  // No logout endpoint in the contract — logout is client-side only.
  function logout() {
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signup, login, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
