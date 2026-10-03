import React, { useState, useEffect, useRef } from 'react';
import { X, Eye, EyeOff, Mail, Lock, User, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { supabase } from '../supabaseClient';

/* ── Extract a human-readable error string from any Supabase error ── */
function getErrorMessage(error) {
  if (!error) return 'An unknown error occurred.';
  // Handle string errors
  if (typeof error === 'string' && error.trim()) return error;
  // Handle empty objects like {} returned by Supabase rate limiting
  if (typeof error === 'object' && Object.keys(error).length === 0) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  // Handle Supabase AuthError objects
  if (error.message && typeof error.message === 'string' && error.message.trim() && error.message !== '{}') {
    const msg = error.message.toLowerCase();
    if (msg.includes('rate limit') || msg.includes('too many requests') || msg === '{}')
      return 'Too many attempts. Please wait a minute and try again.';
    if (msg.includes('email not confirmed'))
      return 'Please confirm your email first. Check your inbox!';
    if (msg.includes('user already registered') || msg.includes('already been registered'))
      return 'This email is already registered. Try signing in instead.';
    if (msg.includes('invalid login credentials') || msg.includes('invalid email or password'))
      return 'Incorrect email or password. Please try again.';
    if (msg.includes('email address') && msg.includes('invalid'))
      return 'Please enter a valid email address.';
    if (msg.includes('signup') && msg.includes('disabled'))
      return 'New signups are temporarily disabled. Please try later.';
    return error.message;
  }
  // If message IS literally "{}" string
  if (error.message === '{}' || JSON.stringify(error) === '{}') {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  // Fallback
  return 'Something went wrong. Please try again.';
}

/* ── Password Strength Checker ── */
function getPasswordStrength(password) {
  if (!password) return { score: 0, label: '', color: '' };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: 'Weak', color: '#ff4d6d' };
  if (score === 2) return { score, label: 'Fair', color: '#ffd60a' };
  if (score === 3) return { score, label: 'Good', color: '#2ec4b6' };
  if (score === 4) return { score, label: 'Strong', color: '#06d6a0' };
  return { score, label: 'Legendary', color: '#a855f7' };
}

function PasswordStrengthBar({ password }) {
  const { score, label, color } = getPasswordStrength(password);
  const segments = 5;

  if (!password) return null;

  return (
    <div className="pwd-strength-wrapper">
      <div className="pwd-strength-bar">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className="pwd-strength-segment"
            style={{
              backgroundColor: i < score ? color : 'var(--bg-card)',
              transition: 'background-color 0.3s ease',
            }}
          />
        ))}
      </div>
      <span className="pwd-strength-label" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

/* ── Discord Icon SVG (lucide has no Discord icon) ── */
function DiscordIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

/* ── Main Auth Modal Component ── */
export default function AuthModal({ onClose }) {
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const overlayRef = useRef(null);

  // ── Form fields ──
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const clearForm = () => {
    setEmail(''); setUsername(''); setPassword(''); setConfirmPassword('');
    setMessage({ type: '', text: '' });
  };

  const switchTab = (t) => { setTab(t); clearForm(); };

  /* ── Handlers ── */
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return setMessage({ type: 'error', text: 'Please fill in all fields.' });

    setLoading(true);
    setMessage({ type: '', text: '' });

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (error) {
      setMessage({ type: 'error', text: getErrorMessage(error) });
    } else {
      setMessage({ type: 'success', text: 'Welcome back! Signing you in…' });
      setTimeout(onClose, 1000);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!email || !username || !password || !confirmPassword)
      return setMessage({ type: 'error', text: 'Please fill in all fields.' });
    if (password !== confirmPassword)
      return setMessage({ type: 'error', text: 'Passwords do not match.' });
    if (password.length < 6)
      return setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });

    setLoading(true);
    setMessage({ type: '', text: '' });

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } }
    });

    setLoading(false);
    if (error) {
      setMessage({ type: 'error', text: getErrorMessage(error) });
    } else {
      setMessage({ type: 'success', text: 'Account created! Check your email to confirm, then sign in.' });
      setTimeout(() => switchTab('login'), 2500);
    }
  };

  const getRedirectUrl = () => {
    return `${window.location.protocol}//${window.location.host}/`;
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: getRedirectUrl() }
    });
    if (error) { setMessage({ type: 'error', text: getErrorMessage(error) }); setLoading(false); }
  };

  const handleDiscordAuth = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: getRedirectUrl() }
    });
    if (error) { setMessage({ type: 'error', text: getErrorMessage(error) }); setLoading(false); }
  };

  /* ── Overlay click to close ── */
  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div className="auth-overlay" ref={overlayRef} onClick={handleOverlayClick} role="dialog" aria-modal="true" aria-label="Sign In">
      <div className="auth-modal">
        {/* Header */}
        <div className="auth-modal-header">
          <div className="auth-brand">
            <span className="auth-brand-n">N</span>
            <span className="auth-brand-text">EetNet</span>
          </div>
          <button className="auth-close-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        {/* Tabs */}
        <div className="auth-tabs" role="tablist">
          <button
            id="auth-tab-login"
            role="tab"
            className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => switchTab('login')}
            aria-selected={tab === 'login'}
          >
            Sign In
          </button>
          <button
            id="auth-tab-register"
            role="tab"
            className={`auth-tab ${tab === 'register' ? 'active' : ''}`}
            onClick={() => switchTab('register')}
            aria-selected={tab === 'register'}
          >
            Create Account
          </button>
        </div>

        {/* Status message */}
        {message.text && (
          <div className={`auth-message auth-message--${message.type}`}>
            {message.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
            <span>{message.text}</span>
          </div>
        )}

        {/* ── Login Form ── */}
        {tab === 'login' && (
          <form className="auth-form" onSubmit={handleLogin} noValidate>
            <div className="auth-field">
              <label htmlFor="login-email">Email</label>
              <div className="auth-input-wrapper">
                <Mail size={16} className="auth-input-icon" />
                <input
                  id="login-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="login-password">Password</label>
              <div className="auth-input-wrapper">
                <Lock size={16} className="auth-input-icon" />
                <input
                  id="login-password"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button type="button" className="auth-pwd-toggle" onClick={() => setShowPwd(v => !v)} tabIndex={-1} aria-label="Toggle password">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              className="auth-submit-btn"
              disabled={loading}
            >
              {loading ? <><Loader size={16} className="auth-spin" /> Signing in…</> : 'Sign In'}
            </button>
          </form>
        )}

        {/* ── Register Form ── */}
        {tab === 'register' && (
          <form className="auth-form" onSubmit={handleRegister} noValidate>
            <div className="auth-field">
              <label htmlFor="reg-email">Email</label>
              <div className="auth-input-wrapper">
                <Mail size={16} className="auth-input-icon" />
                <input
                  id="reg-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="reg-username">Username / Display Name</label>
              <div className="auth-input-wrapper">
                <User size={16} className="auth-input-icon" />
                <input
                  id="reg-username"
                  type="text"
                  placeholder="CoolAnimeFan42"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="reg-password">Password</label>
              <div className="auth-input-wrapper">
                <Lock size={16} className="auth-input-icon" />
                <input
                  id="reg-password"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={loading}
                />
                <button type="button" className="auth-pwd-toggle" onClick={() => setShowPwd(v => !v)} tabIndex={-1} aria-label="Toggle password">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <PasswordStrengthBar password={password} />
            </div>

            <div className="auth-field">
              <label htmlFor="reg-confirm-password">Confirm Password</label>
              <div className="auth-input-wrapper">
                <Lock size={16} className="auth-input-icon" />
                <input
                  id="reg-confirm-password"
                  type={showConfirmPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={loading}
                />
                <button type="button" className="auth-pwd-toggle" onClick={() => setShowConfirmPwd(v => !v)} tabIndex={-1} aria-label="Toggle confirm password">
                  {showConfirmPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <span className="auth-mismatch">Passwords don&apos;t match</span>
              )}
            </div>

            <button
              id="register-submit-btn"
              type="submit"
              className="auth-submit-btn"
              disabled={loading}
            >
              {loading ? <><Loader size={16} className="auth-spin" /> Creating account…</> : 'Create Account'}
            </button>
          </form>
        )}

        {/* Social Divider */}
        <div className="auth-divider">
          <span>or continue with</span>
        </div>

        {/* Social Buttons */}
        <div className="auth-social-btns">
          <button
            id="google-auth-btn"
            type="button"
            className="auth-social-btn auth-social-btn--google"
            onClick={handleGoogleAuth}
            disabled={loading}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>

          <button
            id="discord-auth-btn"
            type="button"
            className="auth-social-btn auth-social-btn--discord"
            onClick={handleDiscordAuth}
            disabled={loading}
          >
            <DiscordIcon size={18} />
            Continue with Discord
          </button>
        </div>

        {/* Footer */}
        <p className="auth-footer-note">
          {tab === 'login'
            ? <>No account? <button type="button" className="auth-link" onClick={() => switchTab('register')}>Create one free</button></>
            : <>Already have an account? <button type="button" className="auth-link" onClick={() => switchTab('login')}>Sign in</button></>
          }
        </p>
      </div>
    </div>
  );
}
