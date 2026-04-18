import { Injector, Signal, ResourceRef, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { IALStore } from '@angular-libs/store';

/**
 * Configuration options for creating an `RxResourceAdapter`.
 * @template Req The type of the parameters passed to the loader.
 * @template Res The type of the data returned by the loader observable.
 */
export interface RxResourceAdapterOptions<Req, Res> {
  /** Optional function that returns the parameters passed to the loader. Reacts to signal changes natively if signals are used inside. */
  params?: () => Req;
  /** The observable-returning function responsible for fetching the resource data. Receives the current `params` and an `abortSignal` for cancelling requests. */
  loader: (args: { params: Req; abortSignal: AbortSignal }) => Observable<Res>;
  /** Optional Angular Injector to use for dependency resolution. */
  injector?: Injector;
}

/**
 * Represents a wrapper around Angular's `rxResource` tailored for integration with `IALStore`.
 * @template Req The type of the parameters used for loading.
 * @template Res The type of the resolved resource data.
 */
export interface RxResourceAdapter<Req, Res> {
  /**
   * The underlying Angular Resource. Provides detailed access to `.status()`, `.error()`,
   * and `.isLoading()` directly from the modern `rxResource` primitive.
   */
  resource: ResourceRef<Res | undefined>;

  /**
   * The reactive Signal directly linked to the store's state.
   * This is simply an alias for `store.getSignal(key)`, provided here for convenience.
   * This is the recommended way to read the data for rendering, as it includes

   * initial state and automatically stays in sync across tabs and the store itself.
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

/**
 * Creates an rxResource adapter that binds an Angular `rxResource` to a specific key in an `IALStore`.
 * Similar to `createResourceAdapter`, but natively handles RxJS Observables in its loader.
 * It automatically syncs resolved observable data back into the store state, maintaining
 * the loading and error signals within the standard Angular resource primitive.
 *
 * @template StoreState The overall state interface of the store.
 * @template Key The specific key in the store state corresponding to the external resource.
 * @template Req The type of the parameters passed to the rxResource observable loader.
 * @template Res The type of the data returned by the observable.
 *
 * @param store The ALStore instance managing the state.
 * @param key The state property key corresponding to the resource data.
 * @param options Configuration options including the `loader`, `params`, and `injector`.
 * @param defaultInjector Optional Angular Injector to resolve dependencies.
 * @returns An RxResourceAdapter object extending standard Signal rxResource features.
 *
 * @example
 * ```ts
 * interface UserProfile { status: string; }
 * interface AppState { userId: number; userProfile: UserProfile | null; }
 *
 * const initialState: AppState = { userId: 1, userProfile: null };
 *
 * @Injectable({ providedIn: 'root' })
 * export class AppStore extends ALStore<AppState> {
 *   private http = inject(HttpClient);
 *
 *   // Create the rx resource adapter
 *   rxProfileResource = createRxResourceAdapter(this.storeRef, 'userProfile', {
 *     params: () => this.getSignal('userId')(),
 *     loader: ({ params }) => this.http.get<UserProfile>(`/api/users/${params}`)
 *   });
 *
 *   constructor() {
 *     super(initialState);
 *   }
 * }
 * ```
 */
export function createRxResourceAdapter<
  StoreState extends Record<string, any>,
  Key extends keyof StoreState,
  Req = any,
  Res extends any = StoreState[Key],
>(
  store: IALStore<StoreState>,
  key: Key,
  options: RxResourceAdapterOptions<Req, NoInfer<Res>>,
): RxResourceAdapter<Req, Res> {
  const storeInjector = options.injector ?? inject(Injector);

  const res = rxResource<Res, Req>({
    params: options.params as any,
    stream: (args) => {
      // Patch the store automatically whenever the observable emits successfully
      return options.loader({ params: args.params as Req, abortSignal: args.abortSignal }).pipe(
        tap((result: Res) => {
          store.set(key, result as any);
        }),
      );
    },
    injector: storeInjector,
  });

  return {
    resource: res as ResourceRef<Res | undefined>,
    value: store.getSignal(key) as unknown as Signal<Res>,
    isLoading: res.isLoading,
    reload: () => res.reload(),
  };
}
