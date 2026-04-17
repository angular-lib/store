import { resource, ResourceRef, Injector, Signal } from '@angular/core';
import { ResourceAdapter, ResourceAdapterOptions } from '../interfaces/resource-adapter';
import { IALStore } from '../interfaces/ial-store';

/**
 * Binds an Angular `resource` to a specific key in an `IALStore`.
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
  defaultInjector?: Injector,
): ResourceAdapter<Req, Res> {
  const storeInjector = options.injector || defaultInjector;

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
