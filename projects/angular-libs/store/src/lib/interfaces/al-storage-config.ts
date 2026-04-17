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
}
