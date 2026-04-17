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
  Injector,
} from '@angular/core';
import { ALStorageConfig } from './interfaces';
import { IALStore } from './interfaces/ial-store';
import { createEntityAdapter } from './adapters/entity-adapter';
import { createResourceAdapter } from './adapters/resource-adapter';
import { createHistoryAdapter } from './adapters/history-adapter';
import { ResourceAdapter, ResourceAdapterOptions } from './interfaces/resource-adapter';
import { HistoryAdapter, HistoryAdapterOptions } from './interfaces/history-adapter';
import { EntityAdapter, EntityAdapterOptions } from './interfaces/entity-adapter';

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
 *   usersAdapter = this.entityAdapter('users', { idField: 'id' });
 *
 *   // Async data fetching bound to 'profile', refetching when 'selectedUserId' changes
 *   profileResource = this.resourceAdapter('profile', {
 *     params: () => ({ id: this.getSignal('selectedUserId')() }),
 *     loader: async ({ params, abortSignal }) => fetchProfile(params.id, abortSignal)
 *   });
 *
 *   // Undo/redo tracking bound to 'document'
 *   documentHistory = this.historyAdapter('document', { limit: 10 });
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
  private injector = inject(Injector);

  constructor(initialState?: T, configOverride?: Partial<ALStorageConfig>) {
    const config = inject(SIGNAL_STORAGE_CONFIG, { optional: true });

    this.initialState = initialState || ({} as T);
    const mergedConfig = { ...DEFAULT_CONFIG, ...(config || {}), ...(configOverride || {}) };
    this.storage = mergedConfig.storageFactory();

    if (typeof window !== 'undefined') {
      if (this.storage) {
        this.storageEventListener = (event: StorageEvent) => {
          if (event.storageArea !== this.storage) return;

          if (event.key === null) {
            for (const key of this.signals.keys()) {
              this.updateSignalWithInitialState(key);
            }
          } else {
            const typedKey = event.key as keyof T;
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

  get<K extends keyof T>(key: K): T[K] {
    if (!this.storage) {
      return this.initialState?.[key] as T[K];
    }

    const item = this.storage.getItem(key as string);
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

    // Structural equality check to prevent redundant writes and infinite reactivity loops.
    const currentString = this.storage.getItem(key as string);

    if (currentString === valueString) {
      return;
    }

    try {
      this.storage.setItem(key as string, valueString);
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

    this.storage.removeItem(key as string);
    this.updateSignalWithInitialState(key);
  }

  has<K extends keyof T>(key: K): boolean {
    return this.storage?.getItem(key as string) != null;
  }

  /**
   * Creates an `EntityAdapter` to easily manage CRUD operations on an array property in the storage state.
   * Automatically handles state immutability, ID-based lookups, synchronous array updates, and storage persistence.
   *
   * @typeParam K - The state property key. Must refer to an array property in the state.
   * @typeParam Entity - The inferred generic type of the items in the array.
   * @typeParam ID - The type of the unique identifier (usually `string` or `number`).
   *
   * @param key - The exact state property key to manage (e.g., `'users'`).
   * @param options - Configuration for the adapter, such as the `idField` used to track uniqueness.
   *
   * @returns An `EntityAdapter` instance providing methods like `add`, `update`, `remove`, and `clear`.
   *
   * @example
   * ```ts
   * export class UserStore extends ALStore<{ users: User[] }> {
   *   // Exposes this.users.add(user), this.users.remove(id), etc.
   *   users = this.entityAdapter('users', { idField: 'id' });
   * }
   * ```
   */
  protected entityAdapter<
    K extends keyof T,
    Entity extends any = T[K] extends Array<infer U> ? U : any,
    ID extends string | number = string | number,
  >(key: K, options?: EntityAdapterOptions<NoInfer<Entity>, ID>): EntityAdapter<Entity, ID> {
    return createEntityAdapter<T, K, Entity, ID>(this, key, options as any);
  }

  /**
   * Binds an async Angular `resource` to a specific state property in the storage.
   * Automatically fetches data and patches the exact key in your local/session storage upon resolution,
   * syncing it across tabs instantly via Storage Events.
   *
   * @typeParam K - The state property key that the resource will populate with data.
   * @typeParam Req - The inferred or explicit request type used to fetch the data.
   * @typeParam Res - The inferred or explicit response data type expected from the loader.
   *
   * @param key - The specific state property key to manage (e.g., `'profile'`).
   * @param options - Configuration for the resource, including `params` arguments and the async `loader`.
   *
   * @returns A `ResourceAdapter` wrapping an Angular Resource, providing `isLoading()`, `reload()`, etc.
   *
   * @example
   * ```ts
   * export class ProfileStorage extends ALStorage<{ profile: UserProfile | null, selectedUserId: number }> {
   *   profileResource = this.resourceAdapter('profile', {
   *     // Reactively pass parameters to the loader
   *     params: () => ({ id: this.getSignal('selectedUserId')() }),
   *     loader: async ({ params, abortSignal }) => {
   *       const res = await fetch(`/api/users/${params.id}`, { signal: abortSignal });
   *       return res.json();
   *     }
   *   });
   * }
   * ```
   */
  protected resourceAdapter<K extends keyof T, Req = any, Res extends any = T[K]>(
    key: K,
    options: ResourceAdapterOptions<Req, NoInfer<Res>>,
  ): ResourceAdapter<Req, Res> {
    return createResourceAdapter<T, K, Req, Res>(this, key, options, this.injector);
  }

  /**
   * Binds an undo/redo timeline to a specific state property in the storage.
   * Automatically tracks structural changes up to a capped history limit for time-travel debugging
   * while pushing state to storage along the way.
   *
   * @typeParam K - The specific key in the storage's state being tracked.
   * @typeParam Entity - The inferred type of the value at the specific key.
   *
   * @param key - The specific state property key to bind history to (e.g., `'formContent'`).
   * @param options - Configure history options, such as the maximum undo states `limit`.
   *
   * @returns A `HistoryAdapter` providing `undo()`, `redo()`, `canUndo()`, and `canRedo()`.
   *
   * @example
   * ```ts
   * export class EditorStorage extends ALStorage<{ document: string }> {
   *   documentHistory = this.historyAdapter('document', { limit: 20 });
   *
   *   undo() { this.documentHistory.undo(); }
   * }
   * ```
   */
  protected historyAdapter<K extends keyof T, Entity extends any = T[K]>(
    key: K,
    options?: HistoryAdapterOptions,
  ): HistoryAdapter<Entity> {
    return createHistoryAdapter<T, K, Entity>(this, key, options, this.injector);
  }

  clear(): void {
    if (!this.storage) return;

    for (const key of this.getManagedKeys()) {
      this.storage.removeItem(key as string);
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
