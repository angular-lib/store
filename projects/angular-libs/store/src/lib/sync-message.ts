export type SyncMessage<T> =
  | { action: 'set'; key: keyof T; value: any }
  | { action: 'remove'; key: keyof T }
  | { action: 'clear' }
  | { action: 'patchState'; partialState: Partial<T> };
