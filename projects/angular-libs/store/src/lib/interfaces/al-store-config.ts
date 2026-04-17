/**
 * Configuration options for initializing an in-memory `ALStore`.
 */
export interface ALStoreConfig {
  /**
   * The channel name for BroadcastChannel cross-tab sync.
   * If provided, enables cross-tab synchronization for this store's in-memory data.
   * To avoid state collisions, this must be a unique string identifier across the app if you use multiple `ALStore` instances.
   *
   * @example
   * ```typescript
   * const config: ALStoreConfig = {
   *   syncChannel: 'auth-state-sync'
   * };
   * ```
   */
  syncChannel?: string;
}
