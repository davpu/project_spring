import { createContext, useContext, useState, type ReactNode } from 'react';
import type { User } from './spring/auth-api';

type Session = {
  user: User | null;
  setUser: (user: User | null) => void;
};

const SessionContext = createContext<Session | null>(null);

/**
 * Who is logged in. Lives above the desktop rather than in the Spring window
 * so closing the window keeps you logged in and the Start menu can log you out.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  return (
    <SessionContext.Provider value={{ user, setUser }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession needs a <SessionProvider>');
  return session;
}
