import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import logoImg from '../images/logo.png';
const Header: React.FC = () => {
    const { user, isAdmin, logout, impersonating, stopImpersonating } = useAuth();
    const [showDropdown, setShowDropdown] = useState(false);
    const [mobileNav, setMobileNav] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const location = useLocation();

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Close mobile nav on route change
    useEffect(() => {
        setMobileNav(false);
    }, [location.pathname]);

    if (!user) return null;

    const isActive = (path: string) => location.pathname.startsWith(path);

    return (
        <>
            {impersonating && (
                <div className="impersonation-banner">
                    <span>Viewing as <strong>{impersonating}</strong></span>
                    <button className="btn btn-sm" onClick={stopImpersonating} style={{ marginLeft: '12px', background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>
                        Stop Impersonating
                    </button>
                </div>
            )}
            <header className="header">
                <div className="header-inner">
                    <div className="header-left">
                        <Link to="/instructor/dashboard" className="logo">
                            <img src={logoImg} alt="Logo" className="logo-img" />
                        </Link>

                        {/* Hamburger toggle for mobile */}
                        <button
                            className="mobile-menu-toggle"
                            onClick={() => setMobileNav(prev => !prev)}
                            aria-label="Toggle navigation"
                        >
                            <span className={`hamburger-icon ${mobileNav ? 'open' : ''}`}>
                                <span></span>
                                <span></span>
                                <span></span>
                            </span>
                        </button>

                        <nav className={`header-nav ${mobileNav ? 'mobile-open' : ''}`}>
                            <Link
                                to="/instructor/dashboard"
                                className={`nav-link ${isActive('/instructor/dashboard') ? 'active' : ''}`}
                            >
                                Classes
                            </Link>
                            <Link
                                to="/instructor/my-batches"
                                className={`nav-link ${isActive('/instructor/my-batches') ? 'active' : ''}`}
                            >
                                My Batches
                            </Link>
                            <Link
                                to="/instructor/my-requests"
                                className={`nav-link ${isActive('/instructor/my-requests') ? 'active' : ''}`}
                            >
                                My Requests
                            </Link>
                            {user?.role === 'admin' && (
                                <Link
                                    to="/instructor/admin"
                                    className={`nav-link ${isActive('/instructor/admin') ? 'active' : ''}`}
                                >
                                    Admin
                                </Link>
                            )}
                            {user?.role === 'admin' && (
                                <Link
                                    to="/admin/metabase"
                                    className={`nav-link ${isActive('/admin/metabase') ? 'active' : ''}`}
                                >
                                    Metabase
                                </Link>
                            )}
                        </nav>
                    </div>

                    <div className="header-right" ref={dropdownRef}>
                        <button
                            className="profile-trigger"
                            onClick={() => setShowDropdown(!showDropdown)}
                        >
                            {user.picture ? (
                                <img src={user.picture} alt={user.name} className="avatar" />
                            ) : (
                                <div className="avatar-placeholder">
                                    {user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                </div>
                            )}
                            <span className="profile-name" style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                Hi, {user.name.split(' ')[0]}
                            </span>
                            <span style={{ fontSize: '0.625rem', opacity: 0.5 }}>&#9660;</span>
                        </button>

                        {showDropdown && (
                            <div className="dropdown" style={{ position: 'absolute', top: '56px', right: '24px' }}>
                                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{user.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user.email}</div>
                                    <span className={`badge ${user.role === 'admin' ? 'badge-approved' : 'badge-regular'}`} style={{ marginTop: '4px' }}>
                                        {user.role}
                                    </span>
                                </div>
                                <Link
                                    to="/instructor/policies"
                                    className="dropdown-item"
                                    onClick={() => setShowDropdown(false)}
                                    style={{ display: 'block' }}
                                >
                                    Policies
                                </Link>
                                <button className="dropdown-item danger" onClick={logout}>
                                    Sign Out
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Mobile nav overlay */}
            {mobileNav && <div className="mobile-nav-overlay" onClick={() => setMobileNav(false)} />}
        </>
    );
};

export default Header;
