/*
 * Public API Surface of al-store
 */

export * from './lib/interfaces';
export { ALStore } from './lib/al-store';

export { entityPlugin } from './lib/plugins/entity.plugin';
export { resourcePlugin } from './lib/plugins/resource.plugin';
export { historyPlugin } from './lib/plugins/history.plugin';
export { persistPlugin } from './lib/plugins/persist.plugin';
