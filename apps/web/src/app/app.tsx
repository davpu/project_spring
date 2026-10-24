import { Desktop } from './desktop/desktop';
import { SessionProvider } from './session';

export function App() {
  return (
    <SessionProvider>
      <Desktop />
    </SessionProvider>
  );
}

export default App;
