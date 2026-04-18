import {
  signal,
  WritableSignal,
  Signal,
  Injectable,
  InjectionToken,
  DestroyRef,
  inject,
  makeEnvironmentProviders,
  EnvironmentProviders,
} from '@angular/core';
import { ALStorageConfig } from './interfaces';
import { IALStore } from './interfaces/ial-store';

const DEFAULT_CONFIG: ALStorageConfig = {
  storageFactory: () => (typeof window !== 'undefined' ? window.localStorage : undefined),
};

export const SIGNAL_STORAGE_CONFIG = new InjectionToken<ALStorageConfig>('SIGNAL_STORAGE_CONFIG', {
  providedIn: 'root',
  factory: () => DEFAULT_CONFIG,
});

export function provideSignalStorageConfig(config: Partial<ALStorageConfig>): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: SIGNAL_STORAGE_CONFIG, useValue: { ...DEFAULT_CONFIG, ...config } },
  ]);
}

/**
 * A strongly-typed, reactive storage solution powered by Angular Signals.
 * It natively supports `localStorage`, `sessionStorage`, or any custom storage mechanism.
 * Additionally, it automatically coordinates signal state changes across multiple browser tabs via native `storage` events.
 *
 * Key Features:
 * - **Reactive State**: Exposes state as Angular Signals (`getSignal`) for seamless integration with templates and `computed`/`effect` functions.
 * - **Adapters**: Utilize `this.entityAdapter()` for CRUD array operations, `this.resourceAdapter()` to bridge with async HTTP requests seamlessly, or `this.historyAdapter()` for instant undo/redo capabilities.
 * - **Synchronous Access**: Allows imperative read/write operations (`get`, `set`, `update`) for non-reactive contexts.
 * - **Cross-Tab Sync**: Automatically synchronizes state changes across browser windows/tabs using the native `storage` event.
 * - **Initial State Management**: Preserves default values, allowing safe fallback when state items are removed or the store is cleared.
 *
 * Define a strict type for the storage keys and values using the generic parameter `T`.
 * You can configure the storage mechanism using the `provideSignalStorageConfig` provider function,
 * or by passing a `configOverride` object to `super()` when extending the class.
 *
 * @typeParam T - An interface defining the expected shape of the storage data.
 *
 * @example
 * ```ts
 * // 1. Define your complete storage shape
 * interface AppState {
 *   theme: 'light' | 'dark';
 *   users: User[];
 *   profile: UserProfile | null;
 *   selectedUserId: number;
 *   document: string;
 * }
 *
 * const initialState: AppState = {
 *   theme: 'light',
 *   users: [],
 *   profile: null,
 *   selectedUserId: 1,
 *   document: ''
 * };
 *
 * // 2. Create a typed service utilizing both primitive state and adapters
 * @Injectable({ providedIn: 'root' })
 * export class AppStateStorage extends ALStorage<AppState> {
 *   // Array CRUD operations bound to 'users'
 *   usersAdapter = createEntityAdapter(this.storeRef, 'users', { idField: 'id' });
 *
 *   // Async data fetching bound to 'profile', refetching when 'selectedUserId' changes
 *   profileResource = createResourceAdapter(this.storeRef, 'profile', {
 *     params: () => ({ id: this.getSignal('selectedUserId')() }),
 *     loader: async ({ params, abortSignal }) => fetchProfile(params.id, abortSignal)
 *   });
 *
 *   // Undo/redo tracking bound to 'document'
 *   documentHistory = createHistoryAdapter(this.storeRef, 'document', { limit: 10 });
 *
 *   constructor() {
 *     super(initialState);
 *   }
 * }
 *
 * // 3. Inject and use fluently in your components
 * @Component({ ... })
 * export class MyComponent {
 *   private storage = inject(AppStateStorage);
 *
 *   // Reactive: A readonly Signal that auto-updates
 *   theme = this.storage.getSignal('theme');
 *
 *   // Accessing composed adapter functionality cleanly:
 *   addUser(user: User) {
 *     // Adds to array, updates signals, and pushes natively to localStorage
 *     this.storage.usersAdapter.add(user);
 *   }
 *
 *   undoTyping() {
 *     this.storage.documentHistory.undo();
 *   }
 *
 *   toggleTheme() {
 *     this.storage.update('theme', current => current === 'light' ? 'dark' : 'light');
 *   }
 * }
 * ```
 */
@Injectable()
export abstract class ALStorage<T extends Record<string, any> = {}> implements IALStore<T> {
  private storage?: Storage;
  private signals = new Map<keyof T, WritableSignal<any>>();
  private storageEventListener?: (event: StorageEvent) => void;
  protected initialState: T;
  private destroyRef = inject(DestroyRef);
  private prefix = '';

  constructor(initialState?: T, configOverride?: Partial<ALStorageConfig>) {
    const config = inject(SIGNAL_STORAGE_CONFIG, { optional: true });

    this.initialState = initialState || ({} as T);
    const mergedConfig = { ...DEFAULT_CONFIG, ...(config || {}), ...(configOverride || {}) };
    this.storage = mergedConfig.storageFactory();
    this.prefix = mergedConfig.prefix || '';

    if (typeof window !== 'undefined') {
      if (this.storage) {
        this.storageEventListener = (event: StorageEvent) => {
          if (event.storageArea !== this.storage) return;

          if (event.key === null) {
            for (const key of this.signals.keys()) {
              this.updateSignalWithInitialState(key);
            }
          } else {
            if (!event.key.startsWith(this.prefix)) {
              return;
            }

            const typedKey = event.key.slice(this.prefix.length) as keyof T;
            if (this.signals.has(typedKey)) {
              if (event.newValue === null) {
                this.updateSignalWithInitialState(typedKey);
              } else {
                try {
                  this.updateSignal(typedKey, JSON.parse(event.newValue));
                } catch {
                  // Fall back if parse fails
                  this.updateSignalWithInitialState(typedKey);
                }
              }
            }
          }
        };
        window.addEventListener('storage', this.storageEventListener);

        this.destroyRef.onDestroy(() => {
          if (this.storageEventListener && typeof window !== 'undefined') {
            window.removeEventListener('storage', this.storageEventListener);
          }
        });
      }
    }
  }

  private getManagedKeys(): (keyof T)[] {
    const keys = new Set<keyof T>();
    if (this.initialState) {
      Object.keys(this.initialState).forEach((k) => keys.add(k as keyof T));
    }
    for (const k of this.signals.keys()) {
      keys.add(k);
    }
    return Array.from(keys);
  }

  private getPrefixedKey(key: keyof T): string {
    return `${this.prefix}${String(key)}`;
  }

  get<K extends keyof T>(key: K): T[K] {
    if (!this.storage) {
      return this.initialState?.[key] as T[K];
    }

    const item = this.storage.getItem(this.getPrefixedKey(key));
    if (item !== null && item !== undefined) {
      try {
        return JSON.parse(item) as T[K];
      } catch {} // Suppress JSON parse errors and just fall back to initial state
    }

    return this.initialState?.[key] as T[K];
  }

  getSignal<K extends keyof T>(key: K): Signal<T[K]> {
    if (!this.signals.has(key)) {
      const stateValue = this.get(key);
      this.signals.set(key, signal(stateValue));
    }
    return this.signals.get(key)!.asReadonly();
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    if (!this.storage) return;

    if (value === undefined) {
      return this.remove(key);
    }

    const valueString = JSON.stringify(value);
    const prefixedKey = this.getPrefixedKey(key);

    // Structural equality check to prevent redundant writes and infinite reactivity loops.
    const currentString = this.storage.getItem(prefixedKey);

    if (currentString === valueString) {
      return;
    }

    try {
      this.storage.setItem(prefixedKey, valueString);
    } catch (e) {
      console.error(
        `Error saving to storage for key "${String(key)}". Storage quota may be exceeded.`,
        e,
      );
    }

    this.updateSignal(key, value);
  }

  update<K extends keyof T>(key: K, updateFn: (currentValue: T[K]) => T[K]): void {
    if (!this.storage) return;
    const currentValue = this.get(key);
    const newValue = updateFn(currentValue);
    this.set(key, newValue);
  }

  remove<K extends keyof T>(key: K): void {
    if (!this.storage) return;

    this.storage.removeItem(this.getPrefixedKey(key));
    this.updateSignalWithInitialState(key);
  }

  has<K extends keyof T>(key: K): boolean {
    return this.storage?.getItem(this.getPrefixedKey(key)) != null;
  }

  /**
   * Safe getter to expose the resolved `IALStore<T>` type upcast to adapters.
   * Useful when composing adapters locally in the constructor or property initializers
   * because TypeScript's deferred inference on `this` often produces fallback generic types.
   */
  protected get storeRef(): IALStore<T> {
    return this;
  }

  clear(): void {
    if (!this.storage) return;

    if (this.prefix) {
      // With a prefix, we can safely wipe out all matching keys from storage.
      // This ensures we don't leave dangling data if the `T` schema changes over time.
      const keysToRemove: string[] = [];
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key && key.startsWith(this.prefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => this.storage!.removeItem(k));
    } else {
      // Without a prefix, blindly clearing could destroy data belonging to other apps on the domain.
      // For safety, tightly restrict removal to the schema keys we definitely know about.
      for (const key of this.getManagedKeys()) {
        this.storage.removeItem(this.getPrefixedKey(key));
      }
    }

    for (const key of this.signals.keys()) {
      this.updateSignalWithInitialState(key);
    }
  }

  private updateSignal(key: keyof T, value: any): void {
    if (this.signals.has(key)) {
      this.signals.get(key)!.set(value);
    }
  }

  private updateSignalWithInitialState(key: keyof T): void {
    if (this.signals.has(key)) {
      this.signals.get(key)!.set(this.initialState?.[key]);
    }
  }
}
