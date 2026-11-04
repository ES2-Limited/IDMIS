import React, { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button, Input } from '@idmis/ui';
import { useAuth } from '../../auth';
import { ShieldCheck, Lock, Mail, ArrowRight, KeyRound, Sparkles, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function SignInPage() {
  const navigate = useNavigate();
  const { signIn, verifyTotp } = useAuth();
  const { t, i18n } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');

  const [email, setEmail] = useState('admin@idmis.gov.ng');
  const [password, setPassword] = useState('AdminSecret123!');
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (tempToken) {
        // Step 2: TOTP Verification
        const res = await verifyTotp({
          tempToken,
          totpCode,
        });
        if (res.status === 'authenticated') {
          navigate({ to: '/' });
        }
      } else {
        // Step 1: Sign In
        const res = await signIn({
          email,
          password,
        });

        if (res.status === 'authenticated') {
          navigate({ to: '/' });
        } else if (res.status === 'totp_required') {
          setTempToken(res.tempToken);
        } else if (res.status === 'password_change_required') {
          setError('Password reset is required. Please contact administrator.');
        } else {
          setError('Two-factor setup is required. Please check your authenticator.');
        }
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Invalid credentials. Please verify your email and password.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-teal-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Language Switcher Badge */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-white text-xs font-semibold">
        <Globe className="h-3.5 w-3.5 text-teal-400" />
        <span className="uppercase text-[11px] tracking-wider text-slate-300">Locale:</span>
        <span className="text-teal-300 font-bold">{i18n.language}</span>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-800 text-white font-extrabold text-xl mb-3 shadow-lg ring-1 ring-teal-400/30">
            ID
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            TRIMING <span className="text-teal-400 font-bold">IDMIS 2.0</span>
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-xs mx-auto">
            {tCommon('brand.subtitle')}
          </p>
        </div>

        {/* Glassmorphic Auth Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100">
          <div className="mb-6">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-50 text-teal-800 text-[11px] font-bold mb-2">
              <ShieldCheck className="h-3.5 w-3.5 text-teal-700" />
              {tempToken ? t('twoFactorTitle') : 'Secure Official Portal'}
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              {tempToken ? t('twoFactorTitle') : t('title')}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {tempToken ? t('twoFactorDescription') : t('subtitle')}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!tempToken ? (
              <>
                <div className="space-y-1.5">
                  <label
                    htmlFor="signin-email"
                    className="block text-[11px] font-bold uppercase tracking-wider text-slate-500"
                  >
                    {t('emailLabel')}
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      id="signin-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('emailPlaceholder')}
                      className="w-full pl-10 rounded-xl bg-slate-50 border-slate-200 focus:bg-white text-xs h-10.5 font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="signin-password"
                    className="block text-[11px] font-bold uppercase tracking-wider text-slate-500"
                  >
                    {t('passwordLabel')}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      id="signin-password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('passwordPlaceholder')}
                      className="w-full pl-10 rounded-xl bg-slate-50 border-slate-200 focus:bg-white text-xs h-10.5 font-medium"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-600 text-[11px]">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                    />
                    {t('rememberMe')}
                  </label>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <label
                  htmlFor="totp-code"
                  className="block text-[11px] font-bold uppercase tracking-wider text-slate-500"
                >
                  Verification Code (TOTP)
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="totp-code"
                    type="text"
                    required
                    maxLength={6}
                    autoFocus
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    placeholder={t('totpPlaceholder')}
                    className="w-full pl-10 tracking-widest text-center text-lg font-bold rounded-xl bg-slate-50 border-slate-200 focus:bg-white h-11"
                  />
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl font-bold bg-teal-700 hover:bg-teal-800 text-white shadow-md active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 text-xs"
            >
              {loading ? (
                tempToken ? (
                  t('verifyingTotp')
                ) : (
                  t('authenticating')
                )
              ) : tempToken ? (
                <>
                  {t('verifyTotp')}
                  <ArrowRight className="h-4 w-4" />
                </>
              ) : (
                <>
                  {t('signInButton')}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          {/* Quick Demo Credential Helper */}
          <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-500" /> Demo Sandbox Active
            </span>
            <span className="font-mono text-slate-500 font-medium">Auto-filled: Admin</span>
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-500 mt-6 font-medium">
          {tCommon('brand.project')}
        </p>
      </div>
    </div>
  );
}
