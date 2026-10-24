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
import arrow from '../assets/cursors/arrow.svg';
import hourglass from '../assets/cursors/hourglass.svg';

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
  body, input, select, textarea, button {
    font-family: 'ms_sans_serif';
  }
  /*
   * Win95 arrow everywhere, overriding react95's own pointer cursors; text
   * fields keep the I-beam. Same specificity as the arrow rule and later,
   * so it wins there but still loses to the busy hourglass below.
   */
  html,
  html * {
    cursor: url('${arrow}') 0 0, default !important;
  }
  html :where(input:not([type='checkbox'], [type='radio']), textarea) {
    cursor: text !important;
  }
  /* Set by lib/busy.ts while anything is loading. */
  html[data-busy],
  html[data-busy] * {
    cursor: url('${hourglass}') 12 18, wait !important;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
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
