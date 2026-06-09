import { ALStorePlugin } from '../interfaces/al-store-plugin';
import { IALStore } from '../interfaces/ial-store';

/**
 * Configuration options for the state persistence plugin.
 */
export interface PersistPluginOptions {
  /** The unique key prefix or namespace inside storage. Defaults to 'al-store:'. */
  keyPrefix?: string;
  /** The storage engine to use. Defaults to `localStorage` when running in the browser. */
  storage?: Storage;
  /**
   * If true, enables live cross-tab synchronization using the browser's `BroadcastChannel` API.
   * This ensures real-time syncing works seamlessly across all custom/configured backends.
   * 
   * @default true
   */
  broadcast?: boolean;
}

/**
 * Creates a functional state persistence plugin.
 * It automatically serializes and saves targeted state keys to localStorage/sessionStorage
 * and hydrates them on store initialization without class inheritance.
 *
 * @template StoreState The overall state structure of the store.
 *
 * @param keys The keys inside the state to persist.
 * @param options Configurations including storage mechanism and namespace key prefix.
 *
 * @example
 * ```ts
 * interface AppState { theme: 'light' | 'dark'; search: string; }
 * const initialState: AppState = { theme: 'light', search: '' };
 *
 * @Injectable({ providedIn: 'root' })
 * export class AppStore extends ALStore<AppState> {
 *   // Selectively persist 'theme' in localStorage namespace
 *   statePersister = this.registerPlugin(
 *     persistPlugin(['theme'], { keyPrefix: 'settings-store:' })
 *   );
 *
 *   constructor() {
 *     super(initialState);
 *   }
 * }
 * ```
 */
export function persistPlugin<StoreState extends Record<string, any>>(
  keys: (keyof StoreState)[] | 'all',
  options?: PersistPluginOptions,
): ALStorePlugin<StoreState> {
  const prefix = options?.keyPrefix ?? 'al-store:';
  const broadcast = options?.broadcast ?? true;
  
  // Safely fallback to localStorage in browser environment
  const storageEngine =
    options?.storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);

  const getFullKey = (key: keyof StoreState): string => {
    return `${prefix}${String(key)}`;
  };

  let resolvedKeys: (keyof StoreState)[] = [];
  let broadcastChannel: BroadcastChannel | undefined;
  let isSyncing = false;

  const isKeyTracked = (key: keyof StoreState): boolean => {
    return resolvedKeys.includes(key);
  };

  return {
    onInit(store: IALStore<StoreState>) {
      if (!storageEngine) return;

      resolvedKeys = keys === 'all'
        ? (Object.keys(store.snapshot()) as (keyof StoreState)[])
        : keys;

      // Hydrate tracked keys from storage before view initialization
      for (const key of resolvedKeys) {
        const fullKey = getFullKey(key);
        const savedItem = storageEngine.getItem(fullKey);

        if (savedItem !== null && savedItem !== undefined) {
          try {
            const parsedVal = JSON.parse(savedItem);
            store.set(key, parsedVal);
          } catch (e) {
            console.warn(`[PersistPlugin] Failed to parse hydrated key "${String(key)}" from storage:`, e);
          }
        }
      }

      const isBrowser = typeof window !== 'undefined';

      // Unified BroadcastChannel sync (Works for sessionStorage, custom stores, and localStorage)
      if (broadcast && isBrowser && typeof BroadcastChannel !== 'undefined') {
        try {
          broadcastChannel = new BroadcastChannel(`al-persist:${prefix}`);
          broadcastChannel.onmessage = (event) => {
            const { key, value } = event.data;
            const matchingKey = resolvedKeys.find((k) => String(k) === key);

            if (matchingKey) {
              isSyncing = true;
              try {
                if (value === undefined) {
                  store.reset(matchingKey);
                } else if (JSON.stringify(store.get(matchingKey)) !== JSON.stringify(value)) {
                  store.set(matchingKey, value);
                }
              } finally {
                isSyncing = false;
              }
            }
          };
        } catch (e) {
          console.warn('[PersistPlugin] Failed to initialize BroadcastChannel:', e);
        }
      }
    },

    onAfterUpdate(key, prevValue, newValue) {
      if (!storageEngine || !isKeyTracked(key)) return;

      const fullKey = getFullKey(key);

      // Perform local storage writes
      if (newValue === undefined) {
        storageEngine.removeItem(fullKey);
      } else {
        try {
          const valueString = JSON.stringify(newValue);
          // Only write to storage if the value actually changed to prevent redundant storage events
          if (storageEngine.getItem(fullKey) !== valueString) {
            storageEngine.setItem(fullKey, valueString);
          }
        } catch (e) {
          console.error(
            `[PersistPlugin] Failed to save key "${String(key)}" to storage. Quota exceeded?`,
            e,
          );
        }
      }

      // Sync other tabs/windows in real time (Only execute if change did not originate from a sync event)
      if (broadcast && broadcastChannel && !isSyncing) {
        try {
          broadcastChannel.postMessage({ key: String(key), value: newValue });
        } catch (e) {
          console.warn('[PersistPlugin] Failing broadcasting message:', e);
        }
      }
    },
  };
}
