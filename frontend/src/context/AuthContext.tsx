'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from '@/i18n/navigation';
import { AuthResponse } from '../../../shared/types';

interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  preferredLanguage: 'uz' | 'ru';
  roles: string[];
  permissions: string[];
}

interface AuthCompany {
  id: string;
  name: any;
  slug: string;
  status: string;
  defaultLanguage: string;
  settings?: {
    sales?: {
      enableMultiTierPriceLists?: boolean;
      allowSellerPriceOverride?: boolean;
      defaultCurrency?: string;
    };
    [key: string]: any;
  };
}

interface AuthContextType {
  user: AuthUser | null;
  company: AuthCompany | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (authData: AuthResponse) => void;
  logout: () => void;
  hasPermission: (permissionSlug: string) => boolean;
  hasRole: (roleSlug: string) => boolean;
  updateCompanySettings: (settings: any) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [company, setCompany] = useState<AuthCompany | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();

  useEffect(() => {
    // Load stored auth session from localStorage
    const storedToken = localStorage.getItem('crm_access_token');
    const storedUser = localStorage.getItem('crm_user');
    const storedCompany = localStorage.getItem('crm_company');

    if (storedToken && storedUser && storedCompany) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        setCompany(JSON.parse(storedCompany));
      } catch {
        localStorage.removeItem('crm_access_token');
        localStorage.removeItem('crm_user');
        localStorage.removeItem('crm_company');
      }
    }
    setIsLoading(false);

    const handleUnauthorized = () => {
      setToken(null);
      setUser(null);
      setCompany(null);
      router.push('/login');
    };

    window.addEventListener('crm_unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('crm_unauthorized', handleUnauthorized);
    };
  }, []);

  const login = (authData: AuthResponse) => {
    setToken(authData.tokens.accessToken);
    setUser(authData.user as AuthUser);
    setCompany(authData.company as AuthCompany);

    localStorage.setItem('crm_access_token', authData.tokens.accessToken);
    localStorage.setItem('crm_refresh_token', authData.tokens.refreshToken);
    localStorage.setItem('crm_user', JSON.stringify(authData.user));
    localStorage.setItem('crm_company', JSON.stringify(authData.company));

    router.push('/');
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setCompany(null);

    localStorage.removeItem('crm_access_token');
    localStorage.removeItem('crm_refresh_token');
    localStorage.removeItem('crm_user');
    localStorage.removeItem('crm_company');

    router.push('/login');
  };

  const hasPermission = (permissionSlug: string): boolean => {
    if (!user) return false;
    if (user.roles.includes('super_admin') || user.roles.includes('company_admin')) return true;
    return user.permissions.includes(permissionSlug);
  };

  const hasRole = (roleSlug: string): boolean => {
    if (!user) return false;
    return user.roles.includes(roleSlug);
  };

  const updateCompanySettings = (newSettings: any) => {
    setCompany((prev) => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        settings: {
          ...(prev.settings || {}),
          ...newSettings,
        },
      };
      localStorage.setItem('crm_company', JSON.stringify(updated));
      return updated;
    });
  };

  useEffect(() => {
    if (!token || !company?.id) return;
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    fetch(`${API_BASE_URL}/tenants/settings`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-Id': company.id,
      },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((settings) => {
        if (settings) {
          updateCompanySettings(settings);
        }
      })
      .catch(() => {});
  }, [token, company?.id]);

  return (
    <AuthContext.Provider
      value={{
        user,
        company,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        logout,
        hasPermission,
        hasRole,
        updateCompanySettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
