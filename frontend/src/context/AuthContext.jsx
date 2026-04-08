import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    api.auth.me().then(setUser).catch(() => localStorage.removeItem('token')).finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { token, user: u } = await api.auth.login(email, password);
    localStorage.setItem('token', token);
    setUser(u);
    return u;
  };

  const register = async (data) => {
    const { token, user: u } = await api.auth.register(data);
    localStorage.setItem('token', token);
    setUser(u);
    return u;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
