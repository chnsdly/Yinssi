import { initNavigation } from './navigation.js';
import { initSearch } from './search.js';
import { initDrawers } from './drawers.js';
import { initTOC } from './toc.js';

initNavigation();
const drawers = initDrawers();
initSearch(drawers);
initTOC();
