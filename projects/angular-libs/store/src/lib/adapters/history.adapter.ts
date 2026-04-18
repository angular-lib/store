import { computed, effect, Injector, signal, Signal, untracked, inject } from '@angular/core';
import { HistoryAdapter, HistoryAdapterOptions } from '../interfaces/history.adapter';
import { IALStore } from '../interfaces/ial-store';

/**
 * Creates a `HistoryAdapter` that binds an undo/redo timeline to a specific key in an `IALStore`.
 *
 * This utility automatically tracks changes to the specified state key and maintains a
 * capped history stack, allowing you to easily implement undo/redo functionality to track user edits.
 *
 * @typeParam StoreState - The structure of the entire signal store state dictionary.
 * @typeParam Key - The specific key in the store being tracked.
 * @typeParam T - The inferred type of the value at the specific key.
 *
 * @param store - The `IALStore` instance containing the state to track.
 * @param key - The property key within the store's state to track for undo/redo.
 * @param options - Optional configuration for history limit and Dependency Injection context.
 * @param defaultInjector - Optional fallback Angular `Injector` if not implicitly provided.
 *
 * @returns A `HistoryAdapter` instance providing undo/redo methods and related reactive state signals.
 *
 * @example
 * ```ts
 * interface AppState { doc: string; }
 *
 * const initialState: AppState = { doc: '' };
 *
 * @Injectable({ providedIn: 'root' })
 * export class DocumentStore extends ALStore<AppState> {
 *   // Create the history adapter, tracking the 'doc' state key
 *   docHistory = createHistoryAdapter(this.storeRef, 'doc', { limit: 20 });
 *
 *   constructor() {
 *     super(initialState); // Initialize state
 *   }
 *
 *   updateDoc(newContent: string) {
 *     this.update('doc', newContent); // History is tracked automatically
 *   }
 * }
 *
 * // Usage in component template:
 * // <button (click)="store.docHistory.undo()" [disabled]="!store.docHistory.canUndo()">Undo</button>
 * // <button (click)="store.docHistory.redo()" [disabled]="!store.docHistory.canRedo()">Redo</button>
 * ```
 */
export function createHistoryAdapter<
  StoreState extends Record<string, any>,
  Key extends keyof StoreState,
  T = StoreState[Key],
>(store: IALStore<StoreState>, key: Key, options?: HistoryAdapterOptions): HistoryAdapter<T> {
  const injector = options?.injector ?? inject(Injector);
  const limit = options?.limit ?? 50;

  const undoStack = signal<T[]>([]);
  const redoStack = signal<T[]>([]);

  let isRestoring = false;
  // Deep clone initial value so reference mutations don't corrupt history
  let previousValue = structuredClone(store.get(key));

  // Automatically track changes using an Angular effect!
  effect(
    () => {
      const currentValue = store.getSignal(key)();

      // If the state change was triggered by our own undo()/redo() methods,
      // we bypass saving to avoid creating infinite history loops.
      if (!isRestoring) {
        untracked(() => {
          // We only save history if the value actually changed
          if (JSON.stringify(previousValue) !== JSON.stringify(currentValue)) {
            const past = undoStack();
            const newPast = [...past, previousValue];

            if (newPast.length > limit) {
              newPast.shift(); // Enforce stack limit
            }

            undoStack.set(newPast);
            redoStack.set([]); // Standard behavior: any explicit new action invalidates future redo timeline
          }
        });
      }

      isRestoring = false;
      previousValue = structuredClone(currentValue);
    },
    { injector },
  );

  return {
    canUndo: computed(() => undoStack().length > 0),
    canRedo: computed(() => redoStack().length > 0),

    undo() {
      untracked(() => {
        const past = undoStack();
        if (past.length === 0) return;

        const current = store.get(key);
        const rStack = redoStack();

        // Push current value into the redo stack
        redoStack.set([...rStack, structuredClone(current) as T]);

        // Pop the previous value from the undo stack
        const previous = past[past.length - 1];
        undoStack.set(past.slice(0, past.length - 1));

        isRestoring = true;
        store.set(key, previous as any);
      });
    },

    redo() {
      untracked(() => {
        const rStack = redoStack();
        if (rStack.length === 0) return;

        const current = store.get(key);
        const past = undoStack();

        // Push current value securely back into the undo stack
        undoStack.set([...past, structuredClone(current) as T]);

        // Pop the next value from the redo stack
        const next = rStack[rStack.length - 1];
        redoStack.set(rStack.slice(0, rStack.length - 1));

        isRestoring = true;
        store.set(key, next as any);
      });
    },

    clearHistory() {
      undoStack.set([]);
      redoStack.set([]);
    },
  };
}
