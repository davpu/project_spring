import { configure } from '@testing-library/dom';

// The react95 desktop is a big styled DOM; `findBy*` needs more than the
// default second when the whole suite runs at once.
configure({ asyncUtilTimeout: 5000 });
