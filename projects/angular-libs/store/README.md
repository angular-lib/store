Reactive state management library powered by Angular Signals.

[Stackblitz demo](https://stackblitz.com/edit/angular-libs-store?file=src%2Fmain.ts,src%2Fmain.html)

## Features

- **Store & Plugins**: Lightweight in-memory `ALStore` extensible using standard plugins (like `persistPlugin` for selective persistence/cross-tab sync).
- **Cross-Tab Sync**: Out-of-the-box state synchronization across tabs via `BroadcastChannel` or the modular `persistPlugin`.
- **Plugins**:
  - `entityPlugin`: Native CRUD for collections.
  - `resourcePlugin` / `rxResourcePlugin`: Async/HTTP state tracking.
  - `historyPlugin`: Undo/redo time-travel.
- **Derived State**: Compute derived state easily with `.select()`.

## Quick Start

```typescript
import { Component, inject, Injectable } from '@angular/core';
import { ALStore, entityPlugin } from '@angular-libs/store';

interface User {
  id: number;
  name: string;
  isActive: boolean;
}

interface AppState {
  users: User[];
  filter: 'all' | 'active';
}

const initialState: AppState = { users: [], filter: 'all' };

@Injectable({ providedIn: 'root' })
export class UserStore extends ALStore<AppState> {
  // Bind an entityPlugin for CRUD array operations
  users = this.registerPlugin(entityPlugin('users', { idField: 'id' }));

  // Computed derived state
  filteredUsers = this.select((state) =>
    state.filter === 'active' ? state.users.filter((u) => u.isActive) : state.users,
  );

  constructor() {
    // Pass { syncChannel: '...' } to enable cross-tab sync!
    super(initialState, { syncChannel: 'user_store_sync' });
  }
}

@Component({
  standalone: true,
  template: `
    <button (click)="store.set('filter', 'all')">Show All</button>
    <button (click)="store.set('filter', 'active')">Show Active</button>
    <button (click)="store.users.upsertOne({ id: Date.now(), name: 'Alice', isActive: true })">
      Add Active User
    </button>

    <!-- Iterate over the reactive derived state: -->
    @for (user of store.filteredUsers(); track user.id) {
      <div>{{ user.name }} ({{ user.isActive ? 'Active' : 'Inactive' }})</div>
    }
  `,
})
export class AppComponent {
  store = inject(UserStore);
}
```

## API Overview

### `ALStore` Core Methods

- `getSignal(key)`: Retrieves a reactive readonly Angular Signal for a specific property.
- `get(key)`: Retrieves the current synchronous snapshot value without reactivity.
- `set(key, val)`: Updates a value directly and triggers reactive updates.
- `update(key, fn)`: Safely mutates a value using a callback based on the previous state.
- `patchState(stateOrUpdater)`: Modifies multiple state object properties simultaneously.
- `select(projector)`: Creates a reactive, memoized derived state Signal using a proxy-based callback.
- `snapshot()`: Retrieves a synchronous snapshot of the entire current state object.
- `reset(key?)`: Resets a specific key (or the entire store if omitted) back to its `initialState`.

### Plugins

- `entityPlugin`: Simplifies array management with built-in CRUD operations (`all()`, `addOne(entity)`, `addMany(entities)`, `upsertOne(entity)`, `upsertMany(entities)`, `updateOne(update)`, `removeOne(id)`, `removeMany(ids)`, `setAll(entities)`, `removeAll()`).
- `resourcePlugin`: Manages Promise-based fetching with automatic cancellation, exposing `value()`, `isLoading()`, and `reload()` signals.
- `rxResourcePlugin`: Seamlessly bridges RxJS Observables into your synchronous state (via `@angular-libs/store/rxjs-interop`).
- `historyPlugin`: Adds instant time-travel capabilities (`undo()`, `redo()`, `canUndo()`, `canRedo()`) to any property in your store.
- `persistPlugin`: Automatically serializes and synchronizes selected keys to localStorage, sessionStorage, or custom storages across browser tabs in real-time.

## 🤖 AI / GitHub Copilot Instructions

Want to generate your stores automatically? Copy the prompt below and paste it into GitHub Copilot, or save it to your project's AI rules file (such as `.cursorrules`, `.windsurfrules`, or `.github/copilot-instructions.md`) to teach your AI assistant how to use this library across your entire project.

<details>
<summary><b>Click to view the AI Rules</b></summary>

````markdown
# State Management AI Rules

When creating or interacting with state management in this project, ALWAYS use `@angular-libs/store`.
Do NOT use NgRx, Akita, or plain BehaviorSubjects for stores.

## 1. Creating a Store

- **Base Class**: Extend `ALStore<AppState>`.
- **Setup**: Define an interface `AppState` and a strongly-typed `initialState` object. Call `super(initialState)` in the `@Injectable({ providedIn: 'root' })` constructor.
- **Cross-Tab Sync**: Pass `{ syncChannel: 'channel_name' }` as the second argument to `super()` to enable native cross-tab synchronization of primitive values, or use `persistPlugin`.

## 2. Plugins & APIs

- **entityPlugin (Arrays/CRUD)**: `myEntities = this.registerPlugin(entityPlugin('key', { idField: 'id' }))`
  - _Methods_: `addOne(entity)`, `addMany(entities)`, `updateOne(update)`, `updateMany(updates)`, `upsertOne(entity)`, `upsertMany(entities)`, `removeOne(id)`, `removeMany(ids)`, `setAll(entities)`, `removeAll()`
  - _State_: `this.store.myEntities.all()`, `this.store.myEntities.total()`
- **resourcePlugin (Promises/Fetch)**: `myRes = this.registerPlugin(resourcePlugin('key', { params: () => ({ id: this.getSignal('id')() }), loader: async ({ params, abortSignal }) => fetch(...) }))`
  - _State_: `this.store.myRes.value()`, `this.store.myRes.isLoading()`, `this.store.myRes.reload()`
- **rxResourcePlugin (RxJS/Observables)**: Must import from `@angular-libs/store/rxjs-interop`.
  - _Usage_: `myRx = this.registerPlugin(rxResourcePlugin('key', { params: () => ..., loader: ({ params }) => this.http.get(...) }))`
- **historyPlugin (Undo/Redo)**: `myHistory = this.registerPlugin(historyPlugin('key', { limit: 10 }))`
  - _Methods_: `undo()`, `redo()`, `canUndo()`, `canRedo()`
- **persistPlugin (Persistence)**: `myPersister = this.registerPlugin(persistPlugin(['key1', 'key2']))`

## 3. Consuming & Mutating in Components

- Access primitive state natively as Signals: `myVal = this.store.getSignal('key')`.
- Access derived state (selectors): `activeTodos = this.store.select(state => state.todos.filter(t => t.done))`.
- **Mutations**: Call `this.store.set('key', value)`, `this.store.update('key', state => newState)`, or `this.store.patchState({ ... })` directly.
- **Immutability Requirement**: Use spread syntax or array methods that return new references.

## 4. Reference Example

```typescript
import { Component, inject, Injectable } from '@angular/core';
import {
  ALStore,
  entityPlugin,
  historyPlugin,
  resourcePlugin,
} from '@angular-libs/store';
import { rxResourcePlugin } from '@angular-libs/store/rxjs-interop';

interface Todo {
  id: number;
  title: string;
  done: boolean;
}
interface AppState {
  currentUserId: number;
  todos: Todo[];
  filter: 'all' | 'pending' | 'completed';
}

const initialState: AppState = { currentUserId: 1, todos: [], filter: 'all' };

@Injectable({ providedIn: 'root' })
export class TodoStore extends ALStore<AppState> {
  // 1. Entity Plugin for array CRUD
  todos = this.registerPlugin(entityPlugin('todos', { idField: 'id' }));

  // 2. History Plugin for instant Undo/Redo tracking
  todoHistory = this.registerPlugin(historyPlugin('todos', { limit: 20 }));

  // 3. Resource Plugin for Async/Fetch integration (syncs directly into the 'todos' array!)
  todoResource = this.registerPlugin(
    resourcePlugin('todos', {
      params: () => ({ userId: this.getSignal('currentUserId')() }),
      loader: async ({ params, abortSignal }) => {
        const res = await fetch(`/api/todos?userId=${params.userId}`, { signal: abortSignal });
        return res.json();
      },
    })
  );

  // 4. Reactive Selectors
  derivedTodos = this.select((state) => {
    if (state.filter === 'pending') return state.todos.filter((t) => !t.done);
    if (state.filter === 'completed') return state.todos.filter((t) => t.done);
    return state.todos;
  });

  stats = this.select((state) => {
    const total = state.todos.length;
    const pending = state.todos.filter((t) => !t.done).length;
    return { total, pending, completed: total - pending };
  });

  constructor() {
    // Optional: Pass `{ syncChannel: 'todos_sync' }` here to synchronize state across tabs automatically!
    super(initialState);
  }

  // 5. Custom Actions (Mutations)
  addTodo(title: string) {
    this.todos.upsertOne({ id: Date.now(), title, done: false });
  }

  toggleFilter() {
    this.update('filter', (current) => (current === 'all' ? 'pending' : 'all'));
  }
}
```
````

```

</details>

## License

MIT
```
