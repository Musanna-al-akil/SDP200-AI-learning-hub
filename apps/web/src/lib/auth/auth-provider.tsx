"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  apiClient,
  type AuthUser,
  clearStoredToken,
  getStoredToken,
  setStoredToken,
  type LoginPayload,
  type RegisterPayload,
} from "@/lib/api/client";
import { buildUserAvatarUrl } from "@/lib/avatar";

export type AuthUserWithAvatar = AuthUser & {
  avatarUrl: string;
};

function withAvatar(user: AuthUser): AuthUserWithAvatar {
  return {
    ...user,
    avatarUrl: buildUserAvatarUrl(user.name),
  };
}

type AuthContextValue = {
  user: AuthUserWithAvatar | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<AuthUserWithAvatar>;
  register: (payload: RegisterPayload) => Promise<AuthUserWithAvatar>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUserWithAvatar | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    setIsLoading(true);
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const me = await apiClient.me();
      setUser(withAvatar(me));
    } catch {
      clearStoredToken();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const login = useCallback(async (payload: LoginPayload) => {
    const result = await apiClient.login(payload);
    setStoredToken(result.token);
    const userWithAvatar = withAvatar(result.user);
    setUser(userWithAvatar);
    return userWithAvatar;
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const result = await apiClient.register(payload);
    setStoredToken(result.token);
    const userWithAvatar = withAvatar(result.user);
    setUser(userWithAvatar);
    return userWithAvatar;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } finally {
      clearStoredToken();
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      register,
      logout,
      refreshMe,
    }),
    [user, isLoading, login, register, logout, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
