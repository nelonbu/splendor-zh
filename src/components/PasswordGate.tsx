import { useState, useEffect, type ReactNode } from 'react';
import { getToken, setToken, clearToken } from '../online/socketClient';

interface PasswordGateProps {
  children: ReactNode;
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload.exp) return false;
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}

export function logout() {
  clearToken();
  window.dispatchEvent(new Event('splendor:logout'));
}

export default function PasswordGate({ children }: PasswordGateProps) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // Check if site requires password
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        if (data.passwordRequired) {
          // Server requires auth — check for existing token
          const token = getToken();
          if (token && !isTokenExpired(token)) {
            setAuthenticated(true);
          } else {
            clearToken();
            setAuthenticated(false);
          }
        } else {
          // No password required
          setAuthenticated(true);
        }
      })
      .catch(() => {
        // Server not reachable — allow through (local dev without server)
        setAuthenticated(true);
      });
  }, []);

  // Listen for logout events
  useEffect(() => {
    const handler = () => {
      setAuthenticated(false);
      setPassword('');
      setError('');
    };
    window.addEventListener('splendor:logout', handler);
    return () => window.removeEventListener('splendor:logout', handler);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        const data = await res.json();
        setToken(data.token);
        setAuthenticated(true);
      } else {
        setError('Incorrect password');
        setPassword('');
      }
    } catch {
      setError('Could not connect to server');
    } finally {
      setSubmitting(false);
    }
  }

  // Loading state
  if (authenticated === null) {
    return null;
  }

  // Authenticated — render children
  if (authenticated) {
    return <>{children}</>;
  }

  // Password form
  return (
    <div className="password-gate">
      <div className="password-gate-card">
        <h1>Splendor</h1>
        <p className="password-gate-subtitle">Enter password to continue</p>
        <form onSubmit={handleSubmit}>
          <div className="password-input-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              disabled={submitting}
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowPassword(!showPassword)}
              disabled={submitting || !password}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <button type="submit" disabled={submitting || !password}>
            {submitting ? 'Verifying...' : 'Enter'}
          </button>
        </form>
        {error && <p className="password-gate-error">{error}</p>}
      </div>
    </div>
  );
}
