# @angular-libs/store

Reactive state management library powered by Angular Signals.

[Stackblitz demo](https://stackblitz.com/edit/angular-libs-store?file=src%2Fmain.ts,src%2Fmain.html)

**Features**

- Synchronous in-memory `ALStore` and `ALStorage` (`localStorage` / `sessionStorage` / custom).
- Extensible via highly typed adapters: `EntityAdapter` (for array/collections), `ResourceAdapter` (for async/HTTP integration), and `HistoryAdapter` (for undo/redo).
- Automatic cross-tab sync (via `BroadcastChannel` or native `storage` events).

`npm install @angular-libs/store`

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

The library provides powerful adapters that bind to a specific key in your store.

#### EntityAdapter

Manage an array of entities natively with CRUD methods (`upsert`, `remove`, `update`, etc.).

```typescript
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
  users = this.entityAdapter('users', { idField: 'id' });

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
  profileResource = this.resourceAdapter('profile', {
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

#### HistoryAdapter

Time-travel capabilities with robust undo/redo stacks. It automatically tracks changes made to your state!

```typescript
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
  documentHistory = this.historyAdapter('document', { limit: 20 });

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

### Proteced Adapter Methods

- `entityAdapter(key, options)`
- `resourceAdapter(key, options)`
- `historyAdapter(key, options)`

---

## 🤖 AI / GitHub Copilot Instructions

Want to generate your stores automatically? Copy the prompt below and paste it into GitHub Copilot or your AI assistant of choice!

<details>
<summary><b>Click to copy the Copilot Prompt</b></summary>

```text
Create an Angular 20+ state management service using "@angular-libs/store".

Requirements:
1. Extend `ALStore<AppState>` (or `ALStorage<AppState>` if it needs persistence).
2. Define an interface `AppState` encompassing my domain requirements.
3. Define an `initialState` object.
4. Call `super(initialState)` in the constructor.
5. Use `this.entityAdapter('key', { idField: 'id' })` for arrays/collections.
6. Use `this.resourceAdapter('key', { params, loader })` for fetching async API data.
7. Use `this.historyAdapter('key')` for undo/redo requirements.
8. Add wrapper methods calling `this.update('primitiveKey', fn)` to alter simple scalar variables.
```

</details>

## License

MIT
