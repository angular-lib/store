import { Signal } from '@angular/core';

export type Comparer<T> = (a: T, b: T) => number;
export type IdSelector<T, ID extends string | number = string | number> = (model: T) => ID;

/**
 * Configuration options for creating an EntityAdapter.
 * This instructs the adapter how to uniquely identify and optionally sort your entities.
 */
export interface EntityAdapterOptions<T, ID extends string | number = string | number> {
  /**
   * The property name on the entity to use as its unique identifier.
   * Default is 'id'. Use this OR `selectId`.
   */
  idField?: keyof T;

  /**
   * A custom function to select the unique identifier for a given entity.
   * Use this if the ID derivation is complex (e.g. combining multiple fields). Overrides `idField`.
   */
  selectId?: IdSelector<T, ID>;

  /**
   * A comparison function used to sort the collection (like `Array.prototype.sort`).
   * If `false` or not provided, the collection maintains insertion order.
   */
  sortComparer?: false | Comparer<T>;
}

/**
 * Represents an update to an entity.
 * Note: The `id` property here always represents the identifier **value**,
 * regardless of what the actual identifier property is called on your entity (e.g., `userId`).
 */
export type Update<T, ID extends string | number = string | number> = {
  /** The unique identifier of the entity to update. */
  id: ID;
  /** Partial properties to merge into the existing entity. */
  changes: Partial<T>;
};

/**
 * A feature adapter that provides a set of standard operations for managing an array of entities
 * within a ALStore.
 * All mutations directly update the underlying store and automatically notify components reading from the signals.
 */
export interface EntityAdapter<T, ID extends string | number = string | number> {
  /** The raw Signal containing the array of entities. */
  state: Signal<T[]>;
  /** A computed Signal containing the array of entities (alias for `state`). */
  all: Signal<T[]>;
  /** A computed Signal representing the total number of entities in the collection. */
  total: Signal<number>;

  /** Adds one entity to the collection. If an entity with the exact same ID already exists, it is ignored safely. */
  addOne(entity: T): void;

  /** Adds multiple entities to the collection. Entities with existing IDs are ignored safely. */
  addMany(entities: T[]): void;

  /** Replaces the entire collection with the provided array of entities. */
  setAll(entities: T[]): void;

  /** Adds or replaces one entity in the collection. Overwrites if the ID already exists. */
  setOne(entity: T): void;

  /** Adds or replaces multiple entities in the collection. Overwrites any matching existing IDs. */
  setMany(entities: T[]): void;

  /** Updates an existing entity in the collection using the provided changes. Does nothing if the entity doesn't exist. */
  updateOne(update: Update<T, ID>): void;

  /** Updates multiple existing entities in the collection. Does nothing for IDs that don't exist. */
  updateMany(updates: Update<T, ID>[]): void;

  /** Adds one entity to the collection, or updates it if it already exists. */
  upsertOne(entity: T): void;

  /** Adds multiple entities to the collection, or updates them if they already exist. */
  upsertMany(entities: T[]): void;

  /** Removes one entity from the collection by its ID. */
  removeOne(id: ID): void;

  /** Removes multiple entities from the collection by their IDs. */
  removeMany(ids: ID[]): void;

  /** Removes entities from the collection that satisfy the specified predicate. */
  remove(predicate: (entity: T) => boolean): void;

  /** Removes all entities from the collection, emptying the array completely. */
  removeAll(): void;
}
