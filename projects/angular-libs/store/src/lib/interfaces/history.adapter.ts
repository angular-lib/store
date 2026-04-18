import { Injector, Signal } from '@angular/core';

/**
 * Configuration options for the `HistoryAdapter`.
 * Provides optional settings to control the undo/redo tracking behavior.
 */
export interface HistoryAdapterOptions {
  /** Maximum number of states to keep in the undo stack. Defaults to 50. */
  limit?: number;
  /** Optional injector if created outside of an injection context */
  injector?: Injector;
}

/**
 * An adapter that provides time-travel debugging and undo/redo capabilities
 * for a specific key within an `IALStore`.
 *
 * @typeParam T - The type of the state value being tracked.
 */
export interface HistoryAdapter<T> {
  /** Reactive signal indicating if an undo action is available */
  canUndo: Signal<boolean>;
  /** Reactive signal indicating if a redo action is available */
  canRedo: Signal<boolean>;
  /** Reverts the state to the previous value in the timeline */
  undo(): void;
  /** Applies the next value in the redo timeline */
  redo(): void;
  /** Clears both the undo and redo history stacks */
  clearHistory(): void;
}
