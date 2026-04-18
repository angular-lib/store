Reactive state management library powered by Angular Signals.

[Stackblitz demo](https://stackblitz.com/edit/angular-libs-store?file=src%2Fmain.ts,src%2Fmain.html)

**Features**

- In-memory `ALStore` and persistent `ALStorage` (`localStorage` / `sessionStorage` / custom).
- Extensible via highly typed adapters: `EntityAdapter` (for array/collections), `ResourceAdapter` (for async/HTTP integration), `RxResourceAdapter` (for RxJS streams), and `HistoryAdapter` (for undo/redo).
- Automatic cross-tab sync (via `BroadcastChannel` or native `storage` events).

---

## Usage

### 1. `ALStore` service

`ALStore` is a purely in-memory reactive store (similar to NgRx SignalStore) with built-in cross-tab sync capabilities (via `BroadcastChannel`).

```typescript
import { Component, inject, Injectable } from '@angular/core';
import { ALStore } from '@angular-libs/store';

interface AppState {
  theme: 'light' | 'dark';
}

const initialState: AppState = {
  theme: 'light',
};

@Injectable({ providedIn: 'root' })
export class AppStateStore extends ALStore<AppState> {
  constructor() {
    // Second argument enables cross-tab synchronization
    super(initialState, { syncChannel: 'app_store_sync' });
  }

  toggle() {
    this.update('theme', (t) => (t === 'light' ? 'dark' : 'light'));
  }
}

@Component({
  standalone: true,
  template: `<button (click)="store.toggle()">{{ theme() }}</button>`,
})
export class AppComponent {
  store = inject(AppStateStore);
  theme = this.store.getSignal('theme');
}
```

---

### 2. `ALStorage` service

`ALStorage` is perfect for lightweight, synchronous key-value storage. It supports native cross-tab sync via the browser's `storage` event.

Supports:

- `localStorage` (default)
- `sessionStorage`
- Custom storage mechanisms

```typescript
import { Component, inject, Injectable } from '@angular/core';
import { ALStorage } from '@angular-libs/store';

interface AppState {
  theme: 'light' | 'dark';
}

const initialState: AppState = {
  theme: 'light',
};

@Injectable({ providedIn: 'root' })
export class AppStateStorage extends ALStorage<AppState> {
  constructor() {
    super(initialState);
  }
}

@Component({
  standalone: true,
  template: `<button (click)="toggle()">{{ theme() }}</button>`,
})
export class AppComponent {
  private storage = inject(AppStateStorage);
  theme = this.storage.getSignal('theme');

  toggle() {
    this.storage.update('theme', (t) => (t === 'light' ? 'dark' : 'light'));
  }
}
```

#### Changing the Sync Storage Provider

You can switch to `sessionStorage` or a custom storage mechanism via providers:

```typescript
import { provideSignalStorageConfig } from '@angular-libs/store';

// In app.config.ts
providers: [
  // Use sessionStorage instead of localStorage:
  provideSignalStorageConfig({ storageFactory: () => window.sessionStorage }),
];
```

### 🌟 Built-in Cross-Tab Synchronization

Unlike typical Angular state management tools (like NgRx) that require third-party plugins or custom meta-reducers for multi-window support, this library provides **out-of-the-box cross-tab synchronization**.

- **`ALStore`**: Leverages the native `BroadcastChannel` API. If a user updates the state in Tab A, Tab B instantly receives the update and its Signals react naturally.
- **`ALStorage`**: Leverages native browser `storage` events to sync `localStorage` changes cleanly across windows.

```typescript
@Injectable({ providedIn: 'root' })
export class AppStateStore extends ALStore<AppState> {
  constructor() {
    // Simply provide a syncing channel name, and the state is shared across all open tabs!
    super(initialState, { syncChannel: 'my_app_shared_channel' });
  }
}
```

> **Note:** To use Cross-Tab Sync, ensure your state consists of serializable data (Objects, Arrays, Primitives). Functions or complex class instances cannot be synchronized across tabs via the native structured clone algorithm or JSON stringification.

---

### 3. Adapters

The library provides powerful adapters that bind to a specific key in your store. Use `this.storeRef` to securely link the adapter back to the parent store.

#### EntityAdapter

Manage an array of entities natively with CRUD methods (`upsert`, `remove`, `update`, etc.).

```typescript
import { ALStore, createEntityAdapter } from '@angular-libs/store';

interface User {
  id: number;
  name: string;
}
interface State {
  users: User[];
  isActive: boolean;
}

const initialState: State = {
  users: [],
  isActive: false,
};

@Injectable({ providedIn: 'root' })
export class UserStore extends ALStore<State> {
  // Bind an EntityAdapter to the 'users' key
  users = createEntityAdapter(this.storeRef, 'users', { idField: 'id' });

  constructor() {
    super(initialState);
  }
}

// In component:
// store.users.upsert({ id: 1, name: 'John' });
// store.users.remove(1);
```

#### ResourceAdapter

Seamlessly integrate Angular's asynchronous `resource` API directly into your state. This provides reactive fetching with automatic cancellation and robust loading states, while persisting the result in your chosen `ALStore` or `ALStorage`.

```typescript
import { ALStore, createResourceAdapter } from '@angular-libs/store';

interface User {
  id: number;
  name: string;
}

interface State {
  profile: User | null;
  selectedUserId: number;
}

const initialState: State = {
  profile: null,
  selectedUserId: 1,
};

@Injectable({ providedIn: 'root' })
export class ProfileStore extends ALStore<State> {
  profileResource = createResourceAdapter(this.storeRef, 'profile', {
    // Reactively pass parameters to the loader
    params: () => ({ id: this.getSignal('selectedUserId')() }),
    loader: async ({ params, abortSignal }) => {
      const res = await fetch(`/api/users/${params.id}`, { signal: abortSignal });
      return res.json();
    },
  });

  constructor() {
    super(initialState);
  }
}

// In template or component:
// const store = inject(ProfileStore);
//
// @if (store.profileResource.isLoading()) {
//   <p>Loading...</p>
// } @else {
//   <!-- Use .value() directly from the resource: -->
//   <p>{{ store.profileResource.value()?.name }}</p>
//
//   <!-- Or use the store's native signal (they are the exact same): -->
//   <p>{{ store.getSignal('profile')()?.name }}</p>
// }
//
// // Change the ID to automatically abort the previous fetch and load the new user!
// store.set('selectedUserId', 2);
```

#### RxResourceAdapter (RxJS Interop)

Similar to `ResourceAdapter`, but designed specifically to work with Angular's `rxResource` and RxJS Observables. It automatically handles subscribing to your loaders and writing the result into the state.

```typescript
import { ALStore } from '@angular-libs/store';
import { createRxResourceAdapter } from '@angular-libs/store/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

interface UserProfile {
  status: string;
}
interface AppState {
  userId: number;
  userProfile: UserProfile | null;
}

const initialState: AppState = { userId: 1, userProfile: null };

@Injectable({ providedIn: 'root' })
export class AppStore extends ALStore<AppState> {
  private http = inject(HttpClient);

  // Syncs the HTTP observable automatically into the 'userProfile' key
  rxProfileResource = createRxResourceAdapter(this.storeRef, 'userProfile', {
    params: () => this.getSignal('userId')(),
    loader: ({ params }) => this.http.get<UserProfile>(`/api/users/${params}`),
  });

  constructor() {
    super(initialState);
  }
}
```

#### HistoryAdapter

Time-travel capabilities with robust undo/redo stacks. It automatically tracks changes made to your state!

```typescript
import { ALStore, createHistoryAdapter } from '@angular-libs/store';

interface DocumentState {
  title: string;
  content: string;
}

interface State {
  document: DocumentState;
  unsavedChanges: boolean;
}

const initialState: State = {
  document: { title: 'Untitled', content: '' },
  unsavedChanges: false,
};

@Injectable({ providedIn: 'root' })
export class DocumentStore extends ALStore<State> {
  // Automatically tracks any changes made to 'document'
  documentHistory = createHistoryAdapter(this.storeRef, 'document', { limit: 20 });

  constructor() {
    super(initialState);
  }

  updateContent(newContent: string) {
    // Normal store updates are automatically recorded in the history!
    this.update('document', (doc) => ({ ...doc, content: newContent }));
    this.set('unsavedChanges', true);
  }
}

// In your component or template:
// const store = inject(DocumentStore);
//
// <textarea (input)="store.updateContent($event.target.value)"></textarea>
//
// <button
//   [disabled]="!store.documentHistory.canUndo()"
//   (click)="store.documentHistory.undo()">
//   Undo
// </button>
//
// <button
//   [disabled]="!store.documentHistory.canRedo()"
//   (click)="store.documentHistory.redo()">
//   Redo
// </button>
```

---

## API & Interfaces

- `IALStore<T>` (Implemented by both `ALStore` and `ALStorage`)

- `getSignal(key)`: Retrieves a reactive readonly Angular `Signal` for a specific key.
- `get(key)`: Retrieves data statically from the store without creating a reactive dependency.
- `set(key, value)`: Sets typed data and broadcasts changes to any observing signals (and other tabs if configured).
- `update(key, updateFn)`: Safely updates a value based on its previous state using a callback.
- `remove(key)`: Removes an item completely, reverting local reactive signals to their `initialState`.
- `clear()`: Clears all explicitly set state, reverting everything back to `initialState`.
- `has(key)`: Checks if a key currently exists explicitly in the store.

### Adapters

- `createEntityAdapter(store, key, options)`
- `createResourceAdapter(store, key, options)`
- `createRxResourceAdapter(store, key, options)` (from `@angular-libs/store/rxjs-interop`)
- `createHistoryAdapter(store, key, options)`

---

## 🤖 AI / GitHub Copilot Instructions

Want to generate your stores automatically? Copy the prompt below and paste it into GitHub Copilot, or save it to your project's AI rules file (such as `.cursorrules`, `.windsurfrules`, or `.github/copilot-instructions.md`) to teach your AI assistant how to use this library across your entire project.

<details>
<summary><b>Click to view the AI Rules</b></summary>

\`\`\`markdown

# State Management AI Rules

When creating or interacting with state management in this project, ALWAYS use `@angular-libs/store`.
Do NOT use NgRx, Akita, or plain BehaviorSubjects for stores.

## 1. Creating a Store

- **Base Class**: Extend `ALStore<AppState>` (in-memory) or `ALStorage<AppState>` (persistent).
- **Setup**: Define an interface `AppState` and a strongly-typed `initialState` object. Call `super(initialState)` in the `@Injectable({ providedIn: 'root' })` class constructor.
- **Adapters**:
  - _Collections/Arrays_: `myEntities = createEntityAdapter(this.storeRef, 'key', { idField: 'id' })`
  - _Async Data/API HTTP_: `myRes = createResourceAdapter(this.storeRef, 'key', { params, loader })` (or `createRxResourceAdapter` for RxJS)
  - _Time Travel_: `myHistory = createHistoryAdapter(this.storeRef, 'key', { limit: 10 })`

## 2. Consuming & Mutating in Components

- Access state natively as Signals: `myVal = this.store.getSignal('key')`.
- For adapters, use their properties directly: `this.store.myEntities.items()` or `this.store.myRes.isLoading()`.
- **Mutations**: Call `this.store.set('key', value)` or `this.store.update('key', fn)` directly from components for simple state changes. Only write custom methods in the store for complex/multi-key logic.
- **Constraint**: DO NOT use RxJS observables or `.subscribe()` for state consumption; rely exclusively on Angular Signals.

## 3. Reference Example

```typescript
import { Component, inject, Injectable } from '@angular/core';
import {
  ALStore,
  createEntityAdapter,
  createResourceAdapter,
  createHistoryAdapter,
} from '@angular-libs/store';

// 1. Define State & Initial Values
interface Todo {
  id: number;
  title: string;
  done: boolean;
}
interface AppState {
  todos: Todo[];
  filter: 'all' | 'pending';
}
const initialState: AppState = { todos: [], filter: 'all' };

// 2. Create Store (No boilerplate required!)
@Injectable({ providedIn: 'root' })
export class TodoStore extends ALStore<AppState> {
  // Fetch reactively; automatically refetches when 'filter' signal changes
  todoResource = createResourceAdapter(this.storeRef, 'todos', {
    params: () => ({ filter: this.getSignal('filter')() }),
    loader: async ({ params, abortSignal }) => {
      const res = await fetch(`/api/todos?filter=${params.filter}`, { signal: abortSignal });
      return res.json();
    },
  });

  // Bind adapters for collections to automatically get CRUD methods
  todos = createEntityAdapter(this.storeRef, 'todos', { idField: 'id' });
  // Instantly add Undo/Redo capabilities to the todos array!
  todoHistory = createHistoryAdapter(this.storeRef, 'todos', { limit: 10 });

  constructor() {
    super(initialState);
  }
}

// 3. Consume & Mutate in Component
@Component({
  selector: 'app-todos',
  standalone: true,
  template: `
    <!-- Simple scalar updates -->
    <button (click)="store.set('filter', filter() === 'all' ? 'pending' : 'all')">
      Toggle Filter (Current: {{ filter() }})
    </button>

    <!-- HistoryAdapter Undo/Redo -->
    <button [disabled]="!store.todoHistory.canUndo()" (click)="store.todoHistory.undo()">
      Undo
    </button>
    <button [disabled]="!store.todoHistory.canRedo()" (click)="store.todoHistory.redo()">
      Redo
    </button>

    <!-- ResourceAdapter loading state -->
    @if (store.todoResource.isLoading()) {
      <p>Loading todos...</p>
    }

    <!-- Adapter usage (Signal access & mutations) -->
    @for (todo of store.todos.items(); track todo.id) {
      <div>
        {{ todo.title }} - {{ todo.done ? 'Done' : 'Open' }}
        <button (click)="store.todos.update(todo.id, { done: true })">Complete</button>
        <button (click)="store.todos.remove(todo.id)">Delete</button>
      </div>
    }

    <button (click)="store.todos.upsert({ id: Date.now(), title: 'New', done: false })">
      Add Todo
    </button>
  `,
})
export class TodoComponent {
  store = inject(TodoStore);
  filter = this.store.getSignal('filter'); // Signal<"all" | "pending">
}
```

\`\`\`

</details>

## License

MIT
