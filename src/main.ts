// Fonts are bundled locally — the code-app CSP (font-src 'self') blocks Google Fonts.
import '@fontsource/sora/300.css';
import '@fontsource/sora/400.css';
import '@fontsource/sora/500.css';
import '@fontsource/sora/600.css';
import '@fontsource/sora/700.css';
import '@fontsource/sora/800.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './legacy/orPricing.css';

import { applyLaunchParams } from './dataverse';
import { installHandlerBridge } from './handlerBridge';
import { HANDLERS, start } from './legacy/orPricing.js';

installHandlerBridge(HANDLERS);
await applyLaunchParams();
start();
