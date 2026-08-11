import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { graphqlRequest } from "./graphql-client";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthContextType {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const LOGIN_MUTATION = `
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      accessToken
      refreshToken
      userId
      email
      name
    }
  }
`;

const REGISTER_MUTATION = `
  mutation Register($input: RegisterInput!) {
    register(input: $input) {
      accessToken
      refreshToken
      userId
      email
      name
    }
  }
`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem("accessToken");
    } catch {
      return null;
    }
  });

  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const storedUser = localStorage.getItem("authUser");
      return storedUser ? (JSON.parse(storedUser) as AuthUser) : null;
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return false;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleTokensRefreshed = (e: Event) => {
      const customEvent = e as CustomEvent<{ accessToken: string; refreshToken: string }>;
      if (customEvent.detail?.accessToken) {
        setAccessToken(customEvent.detail.accessToken);
      }
    };

    const handleLogout = () => {
      setAccessToken(null);
      setUser(null);
    };

    window.addEventListener("auth:tokens_refreshed", handleTokensRefreshed);
    window.addEventListener("auth:logout", handleLogout);

    return () => {
      window.removeEventListener("auth:tokens_refreshed", handleTokensRefreshed);
      window.removeEventListener("auth:logout", handleLogout);
    };
  }, []);

  const login = async (email: string, password: string) => {
    const data = await graphqlRequest<{
      login: {
        accessToken: string;
        refreshToken: string;
        userId: string;
        email: string;
        name: string;
      };
    }>(LOGIN_MUTATION, {
      input: { email, password },
    });

    const payload = data.login;
    const authUser: AuthUser = {
      id: payload.userId,
      email: payload.email,
      name: payload.name,
    };

    localStorage.setItem("accessToken", payload.accessToken);
    localStorage.setItem("refreshToken", payload.refreshToken);
    localStorage.setItem("authUser", JSON.stringify(authUser));

    setAccessToken(payload.accessToken);
    setUser(authUser);
  };

  const register = async (email: string, password: string, name: string) => {
    const data = await graphqlRequest<{
      register: {
        accessToken: string;
        refreshToken: string;
        userId: string;
        email: string;
        name: string;
      };
    }>(REGISTER_MUTATION, {
      input: { email, password, name },
    });

    const payload = data.register;
    const authUser: AuthUser = {
      id: payload.userId,
      email: payload.email,
      name: payload.name,
    };

    localStorage.setItem("accessToken", payload.accessToken);
    localStorage.setItem("refreshToken", payload.refreshToken);
    localStorage.setItem("authUser", JSON.stringify(authUser));

    setAccessToken(payload.accessToken);
    setUser(authUser);
  };

  const logout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("authUser");
    setAccessToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: !!user && !!accessToken,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
