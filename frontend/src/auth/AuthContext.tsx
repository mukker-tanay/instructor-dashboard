import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User } from '../types';
import { getMe, logout as apiLogout, impersonateUser, stopImpersonateUser } from '../api/client';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    isAdmin: boolean;
    impersonating: string | null;
    login: () => void;
    logout: () => void;
    refetch: () => void;
    startImpersonating: (email: string) => void;
    stopImpersonating: () => void;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    isAdmin: false,
    impersonating: null,
    login: () => { },
    logout: () => { },
    refetch: () => { },
    startImpersonating: () => { },
    stopImpersonating: () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [impersonating, setImpersonating] = useState<string | null>(
        () => localStorage.getItem('impersonate_email')
    );

    const fetchUser = useCallback(async () => {
        try {
            const u = await getMe();
            setUser(u);
        } catch {
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUser();
    }, [fetchUser]);

    const startImpersonating = useCallback(async (email: string) => {
        try {
            // Backend swaps the session cookie and returns the admin's original token
            const { admin_token } = await impersonateUser(email);
            localStorage.setItem('impersonate_email', email);
            localStorage.setItem('admin_token', admin_token);
            setImpersonating(email);
            // Re-fetch user — now the session cookie is for the impersonated user
            await fetchUser();
        } catch (err) {
            console.error('Impersonation failed:', err);
        }
    }, [fetchUser]);

    const stopImpersonating = useCallback(async () => {
        try {
            const adminToken = localStorage.getItem('admin_token') || '';
            // Backend restores the admin's session cookie
            await stopImpersonateUser(adminToken);
            localStorage.removeItem('impersonate_email');
            localStorage.removeItem('admin_token');
            setImpersonating(null);
            // Re-fetch user — now the session cookie is the admin's again
            await fetchUser();
        } catch (err) {
            console.error('Stop impersonation failed:', err);
        }
    }, [fetchUser]);

    const login = () => {
        window.location.href = '/api/auth/login';
    };

    const logout = async () => {
        await apiLogout();
        setUser(null);
        setImpersonating(null);
        localStorage.removeItem('impersonate_email');
        localStorage.removeItem('admin_token');
        window.location.href = '/';
    };

    // isAdmin: true if the user is admin (when not impersonating)
    // or if we have an admin_token saved (meaning real user is admin)
    const hasAdminToken = !!localStorage.getItem('admin_token');
    const isAdmin = user?.role === 'admin' || hasAdminToken;

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                isAdmin,
                impersonating,
                login,
                logout,
                refetch: fetchUser,
                startImpersonating,
                stopImpersonating,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};
