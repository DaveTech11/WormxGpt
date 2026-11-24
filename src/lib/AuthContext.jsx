import React, { createContext, useState, useContext, useEffect, useCallback } from "react";
import { api } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState(null);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    try {
      const currentUser = await api.auth.me();
      setUser(currentUser);
      setIsAuthenticated(Boolean(currentUser));
      setAuthError(null);
    } catch {
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => { checkUserAuth(); }, [checkUserAuth]);

  // Referral links look like  https://site/register?ref=X1234ABC . Remember the code, then claim it once the person is signed in.
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref && /^[A-Za-z0-9]{4,12}$/.test(ref)) localStorage.setItem("xyron_ref", ref.toUpperCase());
    } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    if (!user) return;
    let code = "";
    try { code = localStorage.getItem("xyron_ref") || ""; } catch { /* ignore */ }
    if (!code) return;
    api.referral.claim(code).catch(() => {}).finally(() => { try { localStorage.removeItem("xyron_ref"); } catch { /* ignore */ } });
  }, [user]);

  // If an admin bans this account, sign out within seconds (and when the tab comes back to the front).
  useEffect(() => {
    if (!user) return undefined;
    let stopped = false;
    const check = async () => {
      try {
        const r = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
        // Signed out from another device (Settings > Security > Where you are signed in): leave instead of showing a stale session.
        if (!stopped && r.status === 401 && !window.location.pathname.startsWith("/two-factor")) {
          try { localStorage.removeItem("xryon_current_user"); } catch { /* ignore */ }
          window.location.replace("/login");
          return;
        }
        if (stopped || r.status !== 403) return;
        const j = await r.json().catch(() => ({}));
        if (j?.code === "account_deactivated") {
          try { localStorage.removeItem("xryon_current_user"); } catch { /* ignore */ }
          window.location.replace("/deactivated");
        }
      } catch { /* offline: try again next time */ }
    };
    const timer = setInterval(check, 20000);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [user]);

  const logout = useCallback(async () => {
    await api.auth.logout();
    setUser(null);
    setIsAuthenticated(false);
    setAuthError(null);
  }, []);

  const navigateToLogin = useCallback(() => {
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated, isLoadingAuth, isLoadingPublicSettings: false,
      authError, appPublicSettings: null, authChecked, logout,
      navigateToLogin, checkUserAuth, checkAppState: checkUserAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};


