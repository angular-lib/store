import {
  signal,
  WritableSignal,
  Signal,
  Injectable,
  DestroyRef,
  inject,
  Injector,
} from '@angular/core';
import { SyncMessage } from './sync-message';
import { ALStoreConfig } from './interfaces';
import { IALStore } from './interfaces/ial-store';
import { createEntityAdapter } from './adapters/entity-adapter';
import { createResourceAdapter } from './adapters/resource-adapter';
import { createHistoryAdapter } from './adapters/history-adapter';
import { ResourceAdapter, ResourceAdapterOptions } from './interfaces/resource-adapter';
import { HistoryAdapter, HistoryAdapterOptions } from './interfaces/history-adapter';
import { EntityAdapter, EntityAdapterOptions } from './interfaces/entity-adapter';

/**
 * `ALStore` is an abstract base class for creating reactive state management services in Angular using Signals.
 * It provides a centralized, type-safe store for managing application or feature state, with built-in support for
 * cross-tab synchronization via `BroadcastChannel`.
 *
 * Key Features:
 * - **Reactive State**: Exposes state as Angular Signals (`getSignal`) for seamless integration with templates and `computed`/`effect` functions.
 * - **Adapters**: Utilize `this.entityAdapter()` for CRUD array operations, `this.resourceAdapter()` to bridge with async HTTP requests seamlessly, or `this.historyAdapter()` for instant undo/redo capabilities.
 * - **Synchronous Access**: Allows imperative read/write operations (`get`, `set`, `update`) for non-reactive contexts.
 * - **Cross-Tab Sync**: Automatically synchronizes state changes across browser windows/tabs when a `syncChannel` is provided.
 * - **Initial State Management**: Preserves default values, allowing safe fallback when state items are removed or the store is cleared.
 *
 * @example
 * ```ts
 * // 1. Define your complete state shape
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
 * export class AppStore extends ALStore<AppState> {
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
 *     super(initialState, { syncChannel: 'app_store_sync' });
 *   }
 * }
 *
 * // 3. Inject and use fluently in your components
 * @Component({ ... })
 * export class MyComponent {
 *   private store = inject(AppStore);
 *
 *   // Reactive: A readonly Signal that auto-updates
 *   theme = this.store.getSignal('theme');
 *
 *   // Accessing composed adapter functionality cleanly:
 *   addUser(user: User) {
 *     this.store.usersAdapter.add(user);
 *   }
 *
 *   undoTyping() {
 *     this.store.documentHistory.undo();
 *   }
 *
 *   toggleTheme() {
 *     this.store.update('theme', current => current === 'light' ? 'dark' : 'light');
 *   }
 * }
 * ```
 *
 * @template T A record type representing the structure of the store's state.
 */
@Injectable()
export abstract class ALStore<T extends Record<string, any> = {}> implements IALStore<T> {
  protected initialState: T;
  private state: Partial<T> = {};
  private signals = new Map<keyof T, WritableSignal<any>>();
  private channel?: BroadcastChannel;
  private destroyRef = inject(DestroyRef);
  private injector = inject(Injector);

  constructor(initialState?: T, config?: ALStoreConfig) {
    this.initialState = initialState || ({} as T);
    const { syncChannel } = config || {};
    if (syncChannel && typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(syncChannel);

      this.destroyRef.onDestroy(() => {
        this.channel?.close();
      });

      this.channel.onmessage = (event: MessageEvent<SyncMessage<T>>) => {
        const data = event.data;
        switch (data.action) {
          case 'set':
            if (data.key !== undefined) {
              this.internalSet(data.key, data.value as any);
            }
            break;
          case 'remove':
            if (data.key !== undefined) {
              this.internalRemove(data.key);
            }
            break;
          case 'clear':
            this.internalClear();
            break;
        }
      };
    }
  }

  get<K extends keyof T>(key: K): T[K] {
    return key in this.state ? (this.state[key] as T[K]) : (this.initialState?.[key] as T[K]);
  }

  getSignal<K extends keyof T>(key: K): Signal<T[K]> {
    if (!this.signals.has(key)) {
      this.signals.set(key, signal(this.get(key)));
    }
    return this.signals.get(key)!.asReadonly();
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    if (value === undefined) {
      return this.remove(key);
    }
    this.internalSet(key, value);
    this.channel?.postMessage({ action: 'set', key, value });
  }

  private internalSet<K extends keyof T>(key: K, value: T[K]): void {
    this.state[key] = value;
    this.updateSignal(key, value);
  }

  update<K extends keyof T>(key: K, updateFn: (currentValue: T[K]) => T[K]): void {
    const currentValue = this.get(key);
    const newValue = updateFn(currentValue);
    this.set(key, newValue);
  }

  remove<K extends keyof T>(key: K): void {
    this.internalRemove(key);
    this.channel?.postMessage({ action: 'remove', key });
  }

  private internalRemove<K extends keyof T>(key: K): void {
    delete this.state[key];
    this.updateSignalWithInitialState(key);
  }

  /**
   * Creates an `EntityAdapter` to easily manage CRUD operations on an array property in the store state.
   * Automatically handles state immutability, ID-based lookups, and synchronous array updates.
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
   * Binds an async Angular `resource` to a specific state property in the store.
   * Automatically fetches data and patches the exact key in your state upon resolution,
   * syncing it across tabs instantly.
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
   * export class ProfileStore extends ALStore<{ profile: UserProfile | null, selectedUserId: number }> {
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
   * Binds an undo/redo timeline to a specific state property in the store.
   * Automatically tracks structural changes up to a capped history limit for time-travel debugging.
   *
   * @typeParam K - The specific key in the store's state being tracked.
   * @typeParam Entity - The inferred type of the value at the specific key.
   *
   * @param key - The specific state property key to bind history to (e.g., `'formContent'`).
   * @param options - Configure history options, such as the maximum undo states `limit`.
   *
   * @returns A `HistoryAdapter` providing `undo()`, `redo()`, `canUndo()`, and `canRedo()`.
   *
   * @example
   * ```ts
   * export class EditorStore extends ALStore<{ document: string }> {
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

  has<K extends keyof T>(key: K): boolean {
    return key in this.state;
  }

  clear(): void {
    this.internalClear();
    this.channel?.postMessage({ action: 'clear' });
  }

  private internalClear(): void {
    this.state = {};
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
