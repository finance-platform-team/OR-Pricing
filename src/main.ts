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
import './styles/app.css';

import { installGlobalListeners, start } from './app';
import { applyLaunchParams } from './data/dataverse';
import { HANDLERS } from './handlers';
import { installHandlerBridge } from './ui/handlerBridge';

installGlobalListeners();
installHandlerBridge(HANDLERS);
await applyLaunchParams();
start();
