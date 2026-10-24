import 'styled-components';
import type { Theme } from 'react95/dist/types';

declare module 'styled-components' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-empty-object-type
  export interface DefaultTheme extends Theme {}
}
