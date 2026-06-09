import {
  signal,
  WritableSignal,
  Signal,
  Injectable,
  DestroyRef,
  inject,
  computed,
} from '@angular/core';
import { SyncMessage } from './sync-message';
import { ALStoreConfig, ALStorePlugin } from './interfaces';
import { IALStore } from './interfaces/ial-store';

/**
 * `ALStore` is an abstract base class for creating reactive state management services in Angular using Signals.
 * It provides a centralized, type-safe store for managing application or feature state, with built-in support for
 * cross-tab synchronization via `BroadcastChannel`.
 *
 * * Key Features:
 * - **Reactive State**: Exposes state as Angular Signals (`getSignal`) for seamless integration with templates and `computed`/`effect` functions.
 * - **Plugins**: Utilize `entityPlugin()` for CRUD array operations, `resourcePlugin()` to bridge with async HTTP requests seamlessly, or `historyPlugin()` for instant undo/redo capabilities.
 * - **Synchronous Access**: Allows imperative read/write operations (`get`, `set`, `update`) for non-reactive contexts.
 * - **Cross-Tab Sync**: Automatically synchronizes state changes across browser windows/tabs when a `syncChannel` is provided.
 * - **Initial State Management**: Preserves default values, allowing safe fallback when state items are reset.
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
 * // 2. Create a typed service utilizing both primitive state and plugins
 * @Injectable({ providedIn: 'root' })
 * export class AppStore extends ALStore<AppState> {
 *   // Array CRUD operations bound to 'users'
 *   usersAdapter = this.registerPlugin(entityPlugin('users', { idField: 'id' }));
 *
 *   // Async data fetching bound to 'profile', refetching when 'selectedUserId' changes
 *   profileResource = this.registerPlugin(resourcePlugin('profile', {
 *     params: () => ({ id: this.getSignal('selectedUserId')() }),
 *     loader: async ({ params, abortSignal }) => fetchProfile(params.id, abortSignal)
 *   }));
 *
 *   // Undo/redo tracking bound to 'document'
 *   documentHistory = this.registerPlugin(historyPlugin('document', { limit: 10 }));
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
  private plugins: ALStorePlugin<T>[] = [];
  private channel?: BroadcastChannel;
  private destroyRef = inject(DestroyRef);

  protected registerPlugin<P extends ALStorePlugin<T>>(plugin: P): P {
    plugin.onInit?.(this);
    this.plugins.push(plugin);
    return plugin;
  }

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
          case 'reset':
            this.internalReset(data.key);
            break;
          case 'patchState':
            if (data.partialState) {
              this.internalPatchState(data.partialState);
            }
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

  select<R>(projector: (state: T) => R): Signal<R> {
    const stateProxy = new Proxy({} as T, {
      get: (_, prop: string | symbol) => {
        return this.getSignal(prop as keyof T)();
      },
    });
    return computed(() => projector(stateProxy));
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    if (value === undefined) {
      return this.reset(key);
    }
    this.internalSet(key, value);
    this.channel?.postMessage({ action: 'set', key, value });
  }

  private internalSet<K extends keyof T>(key: K, value: T[K]): void {
    const prevValue = this.get(key);
    let finalValue = value;
    for (const plugin of this.plugins) {
      if (plugin.onBeforeUpdate) {
        finalValue = plugin.onBeforeUpdate(key, prevValue, finalValue);
      }
    }
    this.state[key] = finalValue;
    this.updateSignal(key, finalValue);
    for (const plugin of this.plugins) {
      plugin.onAfterUpdate?.(key, prevValue, finalValue);
    }
  }

  update<K extends keyof T>(key: K, updateFn: (currentValue: T[K]) => T[K]): void {
    const currentValue = this.get(key);
    const newValue = updateFn(currentValue);
    this.set(key, newValue);
  }

  snapshot(): T {
    return { ...this.initialState, ...this.state } as T;
  }

  patchState(stateOrUpdater: Partial<T> | ((state: T) => Partial<T>)): void {
    const partialState =
      typeof stateOrUpdater === 'function' ? stateOrUpdater(this.snapshot()) : stateOrUpdater;

    this.internalPatchState(partialState);
    this.channel?.postMessage({ action: 'patchState', partialState });
  }

  private internalPatchState(partialState: Partial<T>): void {
    for (const [key, value] of Object.entries(partialState)) {
      if (value === undefined) {
        this.internalReset(key as keyof T);
      } else {
        this.internalSet(key as keyof T, value as any);
      }
    }
  }

  reset<K extends keyof T>(key?: K): void {
    this.internalReset(key);
    this.channel?.postMessage({ action: 'reset', key });
  }

  /**
   * Safe getter to expose the resolved `IALStore<T>` type upcast to adapters.
   * Useful when composing adapters locally in the constructor or property initializers
   * because TypeScript's deferred inference on `this` often produces fallback generic types.
   */
  protected get storeRef(): IALStore<T> {
    return this;
  }

  private internalReset<K extends keyof T>(key?: K): void {
    if (key !== undefined) {
      const prevValue = this.get(key);
      const initialVal = this.initialState?.[key];
      let finalValue = initialVal;
      for (const plugin of this.plugins) {
        if (plugin.onBeforeUpdate) {
          finalValue = plugin.onBeforeUpdate(key, prevValue, finalValue);
        }
      }
      delete this.state[key];
      if (finalValue !== initialVal) {
        this.state[key] = finalValue as any;
      }
      this.updateSignalWithInitialState(key);
      if (finalValue !== initialVal) {
        this.updateSignal(key, finalValue);
      }
      for (const plugin of this.plugins) {
        plugin.onAfterUpdate?.(key, prevValue, finalValue);
      }
    } else {
      const prevSnapshot = this.snapshot();
      this.state = {};
      const keysArray = Array.from(new Set([...Object.keys(this.initialState || {}), ...Object.keys(prevSnapshot)])) as (keyof T)[];
      for (const k of keysArray) {
        const prevValue = prevSnapshot[k];
        const initialVal = this.initialState?.[k];
        let finalValue = initialVal;
        for (const plugin of this.plugins) {
          if (plugin.onBeforeUpdate) {
            finalValue = plugin.onBeforeUpdate(k, prevValue, finalValue);
          }
        }
        if (finalValue !== initialVal) {
          this.state[k] = finalValue as any;
        }
        this.updateSignalWithInitialState(k);
        if (finalValue !== initialVal) {
          this.updateSignal(k, finalValue);
        }
        for (const plugin of this.plugins) {
          plugin.onAfterUpdate?.(k, prevValue, finalValue);
        }
      }
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
