import { computed, Signal } from '@angular/core';
import { EntityAdapter, EntityAdapterOptions, Update } from '../interfaces/entity-adapter';
import { IALStore } from '../interfaces/ial-store';

export function createEntityAdapter<
  StoreState extends Record<string, any>,
  Key extends keyof StoreState,
  T = StoreState[Key] extends Array<infer U> ? U : any,
  ID extends string | number = string | number,
>(
  store: IALStore<StoreState>,
  key: Key,
  options: EntityAdapterOptions<T, ID> = {} as any,
): EntityAdapter<T, ID> {
  const selectId: (entity: T) => ID =
    options.selectId ||
    (options.idField
      ? (entity: T) => entity[options.idField as keyof T] as unknown as ID
      : (entity: any) => entity.id as ID);
  const sortComparer = options.sortComparer;

  const rawSignal = store.getSignal(key) as unknown as Signal<T[] | undefined>;
  const stateSignal = computed(() => rawSignal() ?? []);

  const updateState = (updater: (state: T[]) => T[]) => {
    store.update(key, (s: any) => updater(Array.isArray(s) ? s : []) as any);
  };

  function sortIfNeeded(arr: T[]): T[] {
    if (sortComparer) {
      return [...arr].sort(sortComparer);
    }
    return arr;
  }

  const adapter: EntityAdapter<T, ID> = {
    state: stateSignal,
    all: stateSignal,
    total: computed(() => stateSignal().length),

    addOne(entity: T) {
      updateState((arr) => {
        const id = selectId(entity);
        if (arr.some((item) => selectId(item) === id)) return arr;
        return sortIfNeeded([...arr, entity]);
      });
    },

    addMany(addEntities: T[]) {
      updateState((arr) => {
        if (addEntities.length === 0) return arr;
        let hasChanges = false;
        const newArr = [...arr];

        for (const entity of addEntities) {
          const id = selectId(entity);
          if (!newArr.some((item) => selectId(item) === id)) {
            newArr.push(entity);
            hasChanges = true;
          }
        }
        return hasChanges ? sortIfNeeded(newArr) : arr;
      });
    },

    setAll(setEntities: T[]) {
      updateState((arr) => sortIfNeeded([...setEntities]));
    },

    setOne(entity: T) {
      updateState((arr) => {
        const id = selectId(entity);
        const index = arr.findIndex((item) => selectId(item) === id);

        const newArr = [...arr];
        if (index > -1) {
          newArr[index] = entity;
        } else {
          newArr.push(entity);
        }
        return sortIfNeeded(newArr);
      });
    },

    setMany(setEntities: T[]) {
      updateState((arr) => {
        if (setEntities.length === 0) return arr;
        const newArr = [...arr];

        for (const entity of setEntities) {
          const id = selectId(entity);
          const index = newArr.findIndex((item) => selectId(item) === id);
          if (index > -1) {
            newArr[index] = entity;
          } else {
            newArr.push(entity);
          }
        }
        return sortIfNeeded(newArr);
      });
    },

    updateOne(update: Update<T, ID>) {
      updateState((arr) => {
        const index = arr.findIndex((item) => selectId(item) === update.id);
        if (index === -1) return arr;

        const newArr = [...arr];
        newArr[index] = { ...newArr[index], ...update.changes };
        return sortIfNeeded(newArr);
      });
    },

    updateMany(updates: Update<T, ID>[]) {
      updateState((arr) => {
        if (updates.length === 0) return arr;
        let hasChanges = false;
        const newArr = [...arr];

        for (const update of updates) {
          const index = newArr.findIndex((item) => selectId(item) === update.id);
          if (index > -1) {
            newArr[index] = { ...newArr[index], ...update.changes };
            hasChanges = true;
          }
        }
        return hasChanges ? sortIfNeeded(newArr) : arr;
      });
    },

    upsertOne(entity: T) {
      updateState((arr) => {
        const id = selectId(entity);
        const index = arr.findIndex((item) => selectId(item) === id);

        const newArr = [...arr];
        if (index > -1) {
          newArr[index] = { ...newArr[index], ...entity };
        } else {
          newArr.push(entity);
        }
        return sortIfNeeded(newArr);
      });
    },

    upsertMany(upsertEntities: T[]) {
      updateState((arr) => {
        if (upsertEntities.length === 0) return arr;
        const newArr = [...arr];

        for (const entity of upsertEntities) {
          const id = selectId(entity);
          const index = newArr.findIndex((item) => selectId(item) === id);
          if (index > -1) {
            newArr[index] = { ...newArr[index], ...entity };
          } else {
            newArr.push(entity);
          }
        }
        return sortIfNeeded(newArr);
      });
    },

    removeOne(idToRemove: ID) {
      adapter.removeMany([idToRemove]);
    },

    removeMany(idsToRemove: ID[]) {
      updateState((arr) => {
        if (idsToRemove.length === 0) return arr;
        const idsSet = new Set(idsToRemove);
        const newArr = arr.filter((item) => !idsSet.has(selectId(item)));

        if (newArr.length === arr.length) return arr;
        return newArr;
      });
    },

    remove(predicate: (entity: T) => boolean) {
      updateState((arr) => {
        const newArr = arr.filter((item) => !predicate(item));
        if (newArr.length === arr.length) return arr;
        return newArr;
      });
    },

    removeAll() {
      updateState(() => []);
    },
  };

  return adapter;
}
