import React, { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

/**
 * Route: /admin/becomes/:email
 * When an admin navigates here, impersonation activates via JWT swap
 * and they are redirected to the instructor dashboard as that user.
 */
const ImpersonateRoute: React.FC = () => {
    const { email } = useParams<{ email: string }>();
    const { isAdmin, startImpersonating } = useAuth();
    const navigate = useNavigate();
    const triggered = useRef(false);

    useEffect(() => {
        if (triggered.current) return;
        triggered.current = true;

        if (!email || !isAdmin) {
            navigate('/instructor/dashboard', { replace: true });
            return;
        }

        (async () => {
            await startImpersonating(email);
            navigate('/instructor/dashboard', { replace: true });
        })();
    }, [email, isAdmin, startImpersonating, navigate]);

    return (
        <div className="loading-container" style={{ minHeight: '100vh' }}>
            <div className="spinner" />
            <span style={{ color: 'var(--text-muted)' }}>
                Switching to {email}...
            </span>
        </div>
    );
};

export default ImpersonateRoute;
