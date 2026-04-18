import { resource, ResourceRef, Injector, Signal, inject } from '@angular/core';
import { ResourceAdapter, ResourceAdapterOptions } from '../interfaces/resource.adapter';
import { IALStore } from '../interfaces/ial-store';

/**
 * Creates a resource adapter that binds an Angular `resource` to a specific key in an `IALStore`.
 * It automatically syncs resolved resource data back into the store state, maintaining
 * the loading and error states within the standard Angular resource primitive.
 *
 * @template StoreState The overall state interface of the store.
 * @template Key The specific key in the store state corresponding to the resource data.
 * @template Req The type of the parameters passed to the resource loader.
 * @template Res The type of the data returned by the resource.
 *
 * @param store The ALStore instance managing the state.
 * @param key The state property key corresponding to the resource data.
 * @param options Configuration options including the `loader`, `params`, and `injector`.
 * @param defaultInjector Optional Angular Injector to resolve dependencies.
 * @returns A ResourceAdapter object extending standard Signal resource features with tied store state.
 *
 * @example
 * ```ts
 * interface UserProfile { name: string; }
 * interface AppState { userId: number; userProfile: UserProfile | null; }
 *
 * const initialState: AppState = { userId: 1, userProfile: null };
 *
 * @Injectable({ providedIn: 'root' })
 * export class AppStore extends ALStore<AppState> {
 *   // Create the resource adapter
 *   profileResource = createResourceAdapter(this.storeRef, 'userProfile', {
 *     params: () => this.getSignal('userId')(),
 *     loader: async ({ params }) => fetchUser(params)
 *   });
 *
 *   constructor() {
 *     super(initialState);
 *   }
 * }
 * ```
 */
export function createResourceAdapter<
  StoreState extends Record<string, any>,
  Key extends keyof StoreState,
  Req = any,
  Res = StoreState[Key],
>(
  store: IALStore<StoreState>,
  key: Key,
  options: ResourceAdapterOptions<Req, Res>,
): ResourceAdapter<Req, Res> {
  const storeInjector = options.injector ?? inject(Injector);

  const res = resource<Res, Req>({
    params: options.params,
    loader: async (params) => {
      const result = await options.loader(params);

      // Patch the store automatically whenever the resource resolves successfully!
      // This triggers all standard store mechanics (cross-tab broadcast, localStorage, etc.)
      store.set(key, result as any);

      return result;
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
