import { useState } from 'react';
import { Button } from 'react95';
import type { User } from './auth-api';
import {
  ForgotPasswordView,
  LoginView,
  RegisterView,
  type AuthView,
} from './auth-views';

const VIEWS = {
  login: LoginView,
  register: RegisterView,
  forgot: ForgotPasswordView,
} satisfies Record<AuthView, unknown>;

/** Everything the Spring app does happens inside its desktop window. */
export function SpringApp() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<AuthView>('login');

  if (user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0 }}>
          Logged in as <b>{user.email}</b>.
        </p>
        <Button
          style={{ alignSelf: 'flex-end' }}
          onClick={() => {
            setUser(null);
            setView('login');
          }}
        >
          Log out
        </Button>
      </div>
    );
  }

  const View = VIEWS[view];
  return <View key={view} onNavigate={setView} onAuthenticated={setUser} />;
}
