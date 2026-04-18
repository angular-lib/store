import { signal, WritableSignal, Signal, Injectable, DestroyRef, inject } from '@angular/core';
import { SyncMessage } from './sync-message';
import { ALStoreConfig } from './interfaces';
import { IALStore } from './interfaces/ial-store';

/**
 * `ALStore` is an abstract base class for creating reactive state management services in Angular using Signals.
 * It provides a centralized, type-safe store for managing application or feature state, with built-in support for
 * cross-tab synchronization via `BroadcastChannel`.
 *
 * Key Features:
 * - **Reactive State**: Exposes state as Angular Signals (`getSignal`) for seamless integration with templates and `computed`/`effect` functions.
 * - **Adapters**: Utilize `createEntityAdapter()` for CRUD array operations, `createResourceAdapter()` to bridge with async HTTP requests seamlessly, or `createHistoryAdapter()` for instant undo/redo capabilities.
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

  has<K extends keyof T>(key: K): boolean {
    return key in this.state;
  }

  clear(): void {
    this.internalClear();
    this.channel?.postMessage({ action: 'clear' });
  }

  /**
   * Safe getter to expose the resolved `IALStore<T>` type upcast to adapters.
   * Useful when composing adapters locally in the constructor or property initializers
   * because TypeScript's deferred inference on `this` often produces fallback generic types.
   */
  protected get storeRef(): IALStore<T> {
    return this;
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
