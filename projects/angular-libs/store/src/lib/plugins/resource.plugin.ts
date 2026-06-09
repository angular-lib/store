import { resource, ResourceRef, Injector, Signal, inject, computed } from '@angular/core';
import { ResourceAdapter, ResourceAdapterOptions } from '../interfaces/resource.plugin';
import { IALStore } from '../interfaces/ial-store';
import { ALStorePlugin } from '../interfaces/al-store-plugin';

/**
 * Creates a functional resource plugin that binds an Angular `resource` to a specific key in an `IALStore`.
 * It automatically syncs resolved resource data back into the store state, maintaining
 * the loading and error states within the standard Angular resource primitive.
 *
 * @template StoreState The overall state interface of the store.
 * @template Key The specific key in the store state corresponding to the resource data.
 * @template Req The type of the parameters passed to the resource loader.
 * @template Res The type of the data returned by the resource.
 *
 * @param key The state property key corresponding to the resource data.
 * @param options Configuration options including the `loader`, `params`, and `injector`.
 * @returns A ResourceAdapter object extending standard Signal resource features with tied store state.
 *
 * @example
 * ```ts
 * interface UserProfile { name: string; }
 * interface AppState { userId: number; userProfile: UserProfile | null; }
 * const initialState: AppState = { userId: 1, userProfile: null };
 *
 * @Injectable({ providedIn: 'root' })
 * export class AppStore extends ALStore<AppState> {
 *   // Register the resource plugin directly as a class property
 *   profileResource = this.registerPlugin(resourcePlugin('userProfile', {
 *     params: () => this.getSignal('userId')(),
 *     loader: async ({ params }) => fetchUser(params)
 *   }));
 *
 *   constructor() {
 *     super(initialState);
 *   }
 * }
 * ```
 */
export function resourcePlugin<
  StoreState extends Record<string, any>,
  Key extends keyof StoreState,
  Req = any,
  Res = StoreState[Key],
>(
  key: Key,
  options: ResourceAdapterOptions<Req, Res>,
): ALStorePlugin<StoreState> & ResourceAdapter<Req, Res> {
  const storeInjector = options.injector ?? inject(Injector);
  let storeRef: IALStore<StoreState>;

  const res = resource<Res, Req>({
    params: options.params,
    loader: async (params) => {
      const result = await options.loader(params);

      // Patch the store automatically whenever the resource resolves successfully!
      // This triggers all standard store mechanics (cross-tab broadcast, localStorage, etc.)
      if (storeRef) {
        storeRef.set(key, result as any);
      }

      return result;
    },
    injector: storeInjector,
  });

  const valueSignal = computed(() => {
    if (!storeRef) return undefined as unknown as Res;
    const rawSignal = storeRef.getSignal(key) as unknown as Signal<Res>;
    return rawSignal();
  });

  return {
    onInit(store) {
      storeRef = store;
    },

    resource: res as ResourceRef<Res | undefined>,
    value: valueSignal,
    isLoading: res.isLoading,
    reload: () => res.reload(),
  };
}
