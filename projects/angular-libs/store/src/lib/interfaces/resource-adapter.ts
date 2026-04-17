import { Injector, ResourceRef, Signal } from '@angular/core';

/**
 * Configuration options for creating a ResourceAdapter.
 */
export interface ResourceAdapterOptions<Req, Res> {
  /** Function or Signal returning the request parameters */
  params?: () => Req;
  /** The async loader function that fetches the data */
  loader: (params: { params: Req; abortSignal: AbortSignal }) => Promise<Res>;
  /** Optional injector if created outside of an injection context */
  injector?: Injector;
}

/**
 * A feature adapter that provides seamless integration between Angular's `resource` API
 * and the synchronous `ALStore`.
 */
export interface ResourceAdapter<Req, Res> {
  /**
   * The underlying Angular Resource. Provides detailed access to `.status()`, `.error()`,
   * and `.isLoading()` directly from the modern `resource` primitive.
   */
  resource: ResourceRef<Res | undefined>;

  /**
   * The reactive Signal directly linked to the store's state.
   * This is simply an alias for `store.getSignal(key)`, provided here for convenience.
   * This is the recommended way to read the data for rendering, as it includes
   * initial state and automatically stays in sync across tabs.
   */
  value: Signal<Res>;

  /**
   * A signal indicating if the resource is currently loading.
   * This is a convenient alias for `.resource.isLoading`.
   */
  isLoading: Signal<boolean>;

  /** Triggers a manual reload of the underlying resource */
  reload: () => void;
}
