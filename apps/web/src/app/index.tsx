import { useState } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';

export const queryClient = new QueryClient();

interface TotpSetupData {
  secret: string;
  otpauthUrl: string;
  recoveryCodes: string[];
}

interface AuthUserData {
  id: string;
  email: string;
  displayName: string;
}

function SignInFlow() {
  const [step, setStep] = useState<'sign_in' | 'totp_setup' | 'totp_verify' | 'authenticated'>(
    'sign_in',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [totpSetup, setTotpSetup] = useState<TotpSetupData | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [userData, setUserData] = useState<AuthUserData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || data.message || 'Invalid email or password');
      }

      if (data.status === 'totp_setup_required') {
        setTempToken(data.tempToken);
        // Call setup endpoint to generate secret & recovery codes
        const setupRes = await fetch('/api/auth/totp/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tempToken: data.tempToken }),
        });
        const setupData = await setupRes.json();
        if (!setupRes.ok) {
          throw new Error(setupData.detail || setupData.message || 'Failed to initiate TOTP setup');
        }
        setTotpSetup(setupData);
        setStep('totp_setup');
      } else if (data.status === 'totp_required') {
        setTempToken(data.tempToken);
        setStep('totp_verify');
      } else if (data.status === 'authenticated') {
        setUserData(data.user);
        setStep('authenticated');
      } else {
        throw new Error(`Unexpected status: ${data.status}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/totp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, totpCode: totpCode.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || data.message || 'Invalid TOTP code');
      }

      setUserData(data.user);
      setStep('authenticated');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await fetch('/api/auth/sign-out', { method: 'POST' });
    } catch {
      // ignore
    } finally {
      setStep('sign_in');
      setEmail('');
      setPassword('');
      setTempToken('');
      setTotpSetup(null);
      setTotpCode('');
      setUserData(null);
      setError(null);
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="border-b border-slate-100 pb-5 mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">IDMIS 2.0</h1>
        <p className="mt-1 text-sm text-slate-500">
          TRIMING Irrigation Data Management Information System
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-700 border border-red-200">
          <p className="font-medium">Error</p>
          <p className="mt-0.5">{error}</p>
        </div>
      )}

      {step === 'sign_in' && (
        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="••••••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      )}

      {step === 'totp_setup' && totpSetup && (
        <div className="space-y-5">
          <div className="rounded-lg bg-amber-50 p-4 border border-amber-200 text-sm text-amber-800">
            <p className="font-semibold">Two-Factor Authentication Setup Required</p>
            <p className="mt-1 text-xs text-amber-700">
              System Administrators must configure TOTP before accessing the system.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Secret Key (Manual Entry)
            </label>
            <div className="mt-1 flex items-center justify-between rounded-lg bg-slate-50 p-3 font-mono text-sm font-bold text-slate-900 border border-slate-200 select-all">
              {totpSetup.secret}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Enter this key into your authenticator app (Google Authenticator, 1Password, etc.).
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Emergency Recovery Codes
            </label>
            <div className="mt-1 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 border border-slate-200 font-mono text-xs text-slate-700 select-all">
              {totpSetup.recoveryCodes.map((code, idx) => (
                <div key={idx} className="py-0.5">
                  {code}
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">Save these codes in a secure location.</p>
          </div>

          <form onSubmit={handleVerifyTotp} className="space-y-4 pt-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                6-Digit Authenticator Code
              </label>
              <input
                type="text"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                required
                autoComplete="one-time-code"
                placeholder="123456"
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-center font-mono text-lg tracking-widest text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading || totpCode.length !== 6}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Verifying...' : 'Verify & Complete Setup'}
            </button>
          </form>
        </div>
      )}

      {step === 'totp_verify' && (
        <form onSubmit={handleVerifyTotp} className="space-y-4">
          <div className="rounded-lg bg-blue-50 p-4 border border-blue-200 text-sm text-blue-800">
            <p className="font-semibold">Enter Two-Factor Code</p>
            <p className="mt-1 text-xs text-blue-700">
              Open your authenticator app and enter the 6-digit code.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">6-Digit Code</label>
            <input
              type="text"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              required
              autoComplete="one-time-code"
              placeholder="123456"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-center font-mono text-lg tracking-widest text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading || totpCode.length !== 6}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </form>
      )}

      {step === 'authenticated' && userData && (
        <div className="space-y-5 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Signed In Successfully</h2>
            <p className="mt-1 text-sm text-slate-600">
              {userData.displayName} ({userData.email})
            </p>
          </div>

          <div className="rounded-lg bg-slate-50 p-4 border border-slate-200 text-left text-xs text-slate-600">
            <p className="font-semibold text-slate-800">Authentication Verified</p>
            <p className="mt-1">
              Active session established with staging API. Refresh cookie set with HttpOnly,
              SameSite=Lax.
            </p>
          </div>

          <button
            onClick={handleSignOut}
            disabled={loading}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <Outlet />
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <main className="flex min-h-screen items-center justify-center p-6 bg-slate-100">
      <SignInFlow />
    </main>
  ),
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
