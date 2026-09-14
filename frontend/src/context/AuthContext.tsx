import React, { createContext, useContext, useEffect, useState } from "react";
import {
  api,
  getStoredToken,
  setStoredToken,
  clearStoredToken,
} from "../api/client";
import type { User, UserLoginPayload, UserRegisterPayload, UserUpdatePayload } from "../api/types";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (payload: UserLoginPayload) => Promise<void>;
  register: (payload: UserRegisterPayload) => Promise<void>;
  updateUser: (payload: UserUpdatePayload) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUser = async () => {
    const currentToken = getStoredToken();
    if (!currentToken) {
      setUser(null);
      setToken(null);
      setIsLoading(false);
      return;
    }

    try {
      const me = await api.getMe();
      setUser(me);
      setToken(currentToken);
    } catch (err) {
      console.warn("Failed to fetch current user profile:", err);
      clearStoredToken();
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (payload: UserLoginPayload) => {
    setIsLoading(true);
    try {
      const response = await api.login(payload);
      setStoredToken(response.access_token);
      setToken(response.access_token);
      const me = await api.getMe();
      setUser(me);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (payload: UserRegisterPayload) => {
    setIsLoading(true);
    try {
      // 1. Register user
      await api.register(payload);
      // 2. Automatically log in with the new credentials
      const response = await api.login({
        email: payload.email,
        password: payload.password,
      });
      setStoredToken(response.access_token);
      setToken(response.access_token);
      const me = await api.getMe();
      setUser(me);
    } finally {
      setIsLoading(false);
    }
  };

  const updateUser = async (payload: UserUpdatePayload) => {
    setIsLoading(true);
    try {
      const updated = await api.updateMe(payload);
      setUser(updated);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    clearStoredToken();
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user && !!token,
        login,
        register,
        updateUser,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
