import { Signal } from '@angular/core';

/**
 * A central reactive state management interface using Angular Signals.
 * Exposes typed key/value storage designed for synchronous, atomic, reactive state tracking.
 *
 * **Important:** All updates MUST be immutable. Modifying object references directly
 * will prevent Angular Signals from detecting changes.
 */
export interface IALStore<T extends Record<string, any>> {
  /**
   * Retrieves data synchronously from the store without creating a reactive dependency.
   * Use this method inside purely synchronous functions or handlers where a Signal is NOT needed.
   *
   * @param key The state key to retrieve.
   * @returns The current synchronously read value.
   */
  get<K extends keyof T>(key: K): T[K];

  /**
   * Retrieves a reactive Angular Signal for a specific key.
   * This is the primary method to use when exposing state to Angular component templates or `effect()` blocks.
   *
   * @param key The state key to react to.
   * @returns A readonly Signal containing the current state, updating automatically on mutations.
   *
   * @example
   * themeSignal = store.getSignal('theme');
   */
  getSignal<K extends keyof T>(key: K): Signal<T[K]>;

  /**
   * Sets typed data synchronously in the store and updates observing Signals.
   * Overwrites the state and pushes an update through Signals. Triggers cross-tab broadcasting if configured.   *
   * **Note:** For objects or arrays, the updated value MUST be physically immutable (a new reference).
   * Angular Signals will ignore the update if the reference memory address hasn't changed.   *
   * @param key The state key to inject.
   * @param value The value to apply, strictly matching `T[key]`.
   *
   * @example
   * store.set('theme', 'dark');
   */
  set<K extends keyof T>(key: K, value: T[K]): void;

  /**
   * Safely updates a value based on its previous state using a callback.
   * Use this for operations depending on previous state like counters or pushing arrays `store.update('arr', a => [...a, val])`.   *
   * **Note:** The returned value MUST be a brand new object or array.
   * Modifying `currentValue` directly will break signal reactivity.   *
   * @param key The state key to modify.
   * @param updateFn Callback function transforming current value into new value.
   *
   * @example
   * store.update('count', c => c + 1);
   */
  update<K extends keyof T>(key: K, updateFn: (currentValue: T[K]) => T[K]): void;

  /**
   * Safely updates multiple properties in the state object at once.
   * Conceptually similar to NgRx patchState. Triggers cross-tab broadcasting if configured.
   *
   * @param stateOrUpdater An object containing a subset of the properties to update, or a callback function that receives the current state and returns a partial state.
   *
   * @example
   * store.patchState({ theme: 'dark', count: store.get('count') + 1 });
   * store.patchState((state) => ({ count: state.count + 1 }));
   */
  patchState(stateOrUpdater: Partial<T> | ((state: T) => Partial<T>)): void;

  /**
   * Removes an item from the store, reverting it to its `initialState`.
   * Useful for resetting specific chunks of state back to defaults.
   *
   * @param key The state key to remove entirely.
   */
  remove<K extends keyof T>(key: K): void;

  /**
   * Check if a key currently exists explicitly in the store.
   * This checks actual modified state, not initial defaults.
   *
   * @param key The key to inspect.
   * @returns `true` if modified explicitly and tracking in state, otherwise `false`.
   */
  has<K extends keyof T>(key: K): boolean;

  /**
   * Clears all explicitly set state, reverting everything back to `initialState`.
   * Good for logout or general application resets across tabs.
   * Modifies signals for every tracked key.
   */
  clear(): void;
}
