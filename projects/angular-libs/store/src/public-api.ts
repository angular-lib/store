/*
 * Public API Surface of al-store
 */

export * from './lib/interfaces';
export { ALStorage, provideSignalStorageConfig, SIGNAL_STORAGE_CONFIG } from './lib/al-storage';
export { ALStore } from './lib/al-store';

export { createEntityAdapter } from './lib/adapters/entity.adapter';
export { createResourceAdapter } from './lib/adapters/resource.adapter';
export { createHistoryAdapter } from './lib/adapters/history.adapter';
