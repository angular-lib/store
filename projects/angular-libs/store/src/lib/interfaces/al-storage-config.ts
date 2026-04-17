/**
 * Configuration options for initializing a `ALStorage` store.
 */
export interface ALStorageConfig {
  /**
   * A factory returning the Storage to use (e.g., `() => sessionStorage`).
   * Defaults to `() => localStorage` (or undefined in environments without a `window`).
   *
   * @example
   * ```typescript
   * const config: ALStorageConfig = {
   *   storageFactory: () => window.sessionStorage
   * };
   * ```
   * @default () => localStorage
   */
  storageFactory: () => Storage | undefined;

  /**
   * An optional prefix to prepend to all keys when saving to and reading from storage.
   * Useful to prevent naming collisions when multiple apps share the same domain.
   *
   * @example
   * ```typescript
   * const config: ALStorageConfig = {
   *   storageFactory: () => window.localStorage,
   *   prefix: 'my_app_'
   * };
   * ```
   */
  prefix?: string;
}
