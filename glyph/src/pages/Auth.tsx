import { useState, type FormEvent } from 'react';
import { Link, navigate } from '../router';
import { loadUser, saveUser } from '../product/data';

export interface AuthProps {
  mode: 'signin' | 'signup';
}

export function Auth({ mode }: AuthProps) {
  const existing = loadUser();
  const [name, setName] = useState(existing?.name ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const signup = mode === 'signup';
  const title = signup ? 'Create your account' : 'Welcome back';
  const submitLabel = signup ? 'Create account' : 'Sign in';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const address = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
      setError('Enter an email address like you@university.edu.');
      return;
    }
    if (password.length < 8) {
      setError('Use at least 8 characters for the password.');
      return;
    }
    const displayName = signup
      ? name.trim() || address.split('@')[0]
      : existing?.name || address.split('@')[0];
    saveUser({ name: displayName, email: address });
    navigate('/dashboard');
  };

  return (
    <div className="auth">
      <div className="auth-panel">
        <Link to="/" className="auth-brand" aria-label="glyph home">
          <span className="yc-mark">g</span>
          <span>glyph</span>
        </Link>

        <div className="auth-form-wrap">
          <h1>{title}</h1>
          <p className="auth-sub">
            {signup
              ? 'One account for your documents, exports and previews.'
              : 'Pick up where you left off. Your workspace is waiting in this browser.'}
          </p>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {signup && (
              <label className="field">
                <span>Name</span>
                <input
                  type="text"
                  name="name"
                  autoComplete="name"
                  placeholder="Ada Lovelace"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            )}
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@university.edu"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <span className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete={signup ? 'new-password' : 'current-password'}
                  placeholder={signup ? 'At least 8 characters' : 'Your password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-pressed={showPassword}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-primary btn-block btn-lg">
              {submitLabel}
              <span aria-hidden="true">→</span>
            </button>
          </form>

          <p className="auth-switch">
            {signup ? (
              <>
                Already have an account? <Link to="/signin">Sign in</Link>
              </>
            ) : (
              <>
                New to glyph? <Link to="/signup">Create an account</Link>
              </>
            )}
          </p>

          <div className="auth-demo">
            <strong>Local demo</strong>
            <span>
              This build has no account server. Credentials are stored only in this
              browser and never sent anywhere.
            </span>
          </div>

          <p className="auth-skip">
            <Link to="/dashboard">Explore the dashboard without an account →</Link>
          </p>
        </div>

        <p className="auth-foot">glyph · a Typst editor for serious writing</p>
      </div>

      <aside className="auth-aside" aria-label="About glyph">
        <div className="auth-aside-top">
          <span className="auth-aside-mark">g</span>
          <span className="auth-aside-meta">LOCAL-FIRST · WASM ENGINE</span>
        </div>
        <blockquote>
          The page is the proof.
          <br />
          <em>Everything else is chrome.</em>
        </blockquote>
        <div className="auth-aside-spec">
          <div>
            <span>Preview</span>
            <span>Compiled Typst</span>
          </div>
          <div>
            <span>Editing</span>
            <span>Works offline</span>
          </div>
          <div>
            <span>Export</span>
            <span>PDF · SVG · HTML</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
