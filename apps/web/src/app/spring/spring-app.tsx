import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Hourglass } from 'react95';
import { useSession } from '../session';
import {
  ForgotPasswordView,
  LoginView,
  RegisterView,
  ResetPasswordView,
  type AuthView,
} from './auth-views';
import { SpringShell } from './shell';

const VIEWS = {
  login: LoginView,
  register: RegisterView,
  forgot: ForgotPasswordView,
} satisfies Record<AuthView, unknown>;

/** Everything the Spring app does happens inside its desktop window. */
export function SpringApp() {
  const { user, status, setUser } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [view, setView] = useState<AuthView>('login');
  const [notice, setNotice] = useState<string | null>(null);

  // The link in the password-reset email lands here.
  if (location.pathname === '/reset-password') {
    const token = new URLSearchParams(location.search).get('token');
    return (
      <ResetPasswordView
        token={token}
        onSuccess={() => {
          setNotice('Password updated. Log on with your new password.');
          setView('login');
          navigate('/', { replace: true });
        }}
        onCancel={() => {
          setNotice(null);
          setView('login');
          navigate('/', { replace: true });
        }}
      />
    );
  }

  if (status === 'loading') {
    return (
      <div
        role="status"
        aria-label="Loading"
        style={{ display: 'flex', justifyContent: 'center', padding: 24 }}
      >
        <Hourglass size={32} />
      </div>
    );
  }

  if (user) return <SpringShell />;

  const View = VIEWS[view];
  return (
    <>
      {notice && view === 'login' && (
        <p role="status" style={{ margin: '0 0 12px' }}>
          {notice}
        </p>
      )}
      <View
        key={view}
        onNavigate={(next) => {
          setNotice(null);
          setView(next);
        }}
        onAuthenticated={(next) => {
          // Whoever logs out next (here or from the Start menu) lands on login.
          setView('login');
          setNotice(null);
          setUser(next);
        }}
      />
    </>
  );
}
