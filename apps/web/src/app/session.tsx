import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { UserDto } from '@org/shared';
import { auth } from './api/api';
import { onUnauthorized } from './api/client';

type Session = {
  user: UserDto | null;
  /** `loading` until `/auth/me` has answered once. */
  status: 'loading' | 'ready';
  setUser: (user: UserDto | null) => void;
  logout: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

/**
 * Who is logged in. The session itself is an HttpOnly cookie the page cannot
 * read, so on load we ask the API, and any 401 later drops the user back to
 * the login page.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [status, setStatus] = useState<Session['status']>('loading');

  useEffect(() => {
    const controller = new AbortController();
    auth
      .me(controller.signal)
      .then((me) => setUser(me))
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setStatus('ready');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    onUnauthorized(() => setUser(null));
    return () => onUnauthorized(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await auth.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, status, setUser, logout }),
    [user, status, logout],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession needs a <SessionProvider>');
  return session;
}
