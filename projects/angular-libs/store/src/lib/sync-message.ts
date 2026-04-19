export type SyncMessage<T> =
  | { action: 'set'; key: keyof T; value: any }
  | { action: 'reset'; key?: keyof T }
  | { action: 'patchState'; partialState: Partial<T> };
