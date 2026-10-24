import type { ReactNode } from 'react';
import isPropValid from '@emotion/is-prop-valid';
import {
  createGlobalStyle,
  StyleSheetManager,
  ThemeProvider,
} from 'styled-components';
import { styleReset } from 'react95';
import original from 'react95/dist/themes/original';
import msSansSerif from 'react95/dist/fonts/ms_sans_serif.woff2';
import msSansSerifBold from 'react95/dist/fonts/ms_sans_serif_bold.woff2';

const GlobalStyles = createGlobalStyle`
  ${styleReset}
  @font-face {
    font-family: 'ms_sans_serif';
    src: url('${msSansSerif}') format('woff2');
    font-weight: 400;
    font-style: normal;
  }
  @font-face {
    font-family: 'ms_sans_serif';
    src: url('${msSansSerifBold}') format('woff2');
    font-weight: bold;
    font-style: normal;
  }
  body, input, select, textarea {
    font-family: 'ms_sans_serif';
  }
`;

// react95 targets styled-components v5, which filtered non-HTML props itself;
// v6 forwards everything unless told otherwise.
function shouldForwardProp(propName: string, target: unknown) {
  return typeof target === 'string' ? isPropValid(propName) : true;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <StyleSheetManager shouldForwardProp={shouldForwardProp}>
      <GlobalStyles />
      <ThemeProvider theme={original}>{children}</ThemeProvider>
    </StyleSheetManager>
  );
}
