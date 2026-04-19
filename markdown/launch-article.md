# Introducing @angular-libs/store: An OOP-Based State Management Solution for Modern Angular 🚀

With Angular heavily leaning into Signals, the ecosystem for state management is rapidly evolving. While excellent solutions like the NgRx SignalStore exist, many developers still prefer a more lightweight and straight forward solution.

Therefore thrilled to introduce **`@angular-libs/store`** — a lightweight, completely RxJS-free (at least for now), strongly typed Angular Signal state management solution built specifically for Angular 20+.

🔗 **[Check out the GitHub Repository](https://github.com/angular-lib/angular-libs/tree/main/projects/angular-libs/store)**

**[Stackblitz demo](https://stackblitz.com/edit/angular-libs-store?file=src%2Fal-store.ts,src%2Fmain.ts)**

---

## 🤔 Why another state management library?

Angular development shouldn't require you to wire up massive amounts of boilerplate. `@angular-libs/store` is build to be a straightforward alternative that deeply integrates with modern Angular features.

## ✨ Key Features out of the Box

Instead of just providing a basic state container, `@angular-libs/store` comes fully loaded with powerful adapters to handle common complex UI requirements:

- **🛠 OOP-First Design:** Build your stores using familiar class inheritance and methods.
- **💾 In-Memory State:** Fast `ALStore` for your typical localized component, feature, or global state.
- **💾 Storage:** Built-in `ALStorage` capabilities to easily persist state to localStorage or sessionStorage.
- **📦 Entity Management:** Built-in `EntityAdapter` for easily managing collections of records (CRUD operations, sorting, and selection).
- **🌐 Native Resource API Integration:** Seamless `ResourceAdapter` integration for handling asynchronous data fetching gracefully.
- **⏪ Undo/Redo History:** Time-travel made easy with the `HistoryAdapter`.
- **🔄 Cross-Tab Sync:** Keep your state perfectly in sync across multiple browser tabs out of the box.
- **🚫 100% RxJS-Free:** Built entirely from the ground up using Angular Signals.

## 💻 Let's see some code!

### 1. Getting Started

```bash
npm install @angular-libs/store
```

### 2. A Complete Example: The Power of Adapters & Sync

Instead of writing endless boilerplate across multiple files, watch how we can create a fully reactive, cross-tab synchronized store that handles a list of entities (CRUD) and an asynchronous resource (API fetching) in under 30 lines of code.

```typescript
import { Injectable } from '@angular/core';
import { ALStore } from '@angular-libs/store';

interface User {
  id: number;
  name: string;
}
interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

interface AppState {
  currentUserId: number;
  currentUser: User | null;
  todos: Todo[];
}

const initialState: AppState = {
  currentUserId: null,
  currentUser: null,
  todos: [],
};

@Injectable({ providedIn: 'root' })
export class AppStore extends ALStore<AppState> {
  // 1. 📦 Entity Adapter: Instant CRUD operations for arrays
  todos = this.entityAdapter('todos', { idField: 'id' });

  // 2. ⏪ History Adapter: Instantly enable undo/redo for your todos
  todosHistory = this.historyAdapter('todos');

  // 3. 🌐 Resource Adapter: Native async integration with loading states
  userResource = this.resourceAdapter('currentUser', {
    // Reactively pass parameters to the loader
    params: () => ({ userId: this.getSignal('currentUserId')() }),
    loader: async ({ params, abortSignal }) => {
      if (!params.userId) return null;
      const res = await fetch(`/api/users/${params.userId}`, { signal: abortSignal });
      return res.json();
    },
  });

  constructor() {
    // 4. 💾 Cross-Tab Sync: Share state instantly across browser tabs
    super(initialState, { syncChannel: 'app_sync_channel' });
  }

  // Utilize the entity adapter's built-in methods
  addTodo(title: string) {
    // We can also patch the state directly, a familiar pattern:
    // this.patchState({ currentUserId: 99 });
    // this.patchState(state => ({ currentUserId: state.currentUserId + 1 }));

    this.todos.upsertOne({
      id: crypto.randomUUID(),
      title,
      completed: false,
    });
  }

  toggleTodo(id: string, completed: boolean) {
    this.todos.updateOne({ id, changes: { completed } });
  }
}
```

### 3. Consuming it in a Component

Because everything is powered by standard Angular Signals, using it in your templates is clean and intuitive—no async pipes or subscriptions required!

```typescript
import { Component, inject } from '@angular/core';
import { AppStore } from './app.store';

@Component({
  selector: 'app-root',
  standalone: true,
  template: `
    @if (store.userResource.isLoading()) {
      <p>Loading user...</p>
    } @else if (store.userResource.value(); as user) {
      <h2>Welcome, {{ user.name }}</h2>
    }

    <ul>
      @for (todo of store.todos.all(); track todo.id) {
        <li>
          <input
            type="checkbox"
            [checked]="todo.completed"
            (change)="store.toggleTodo(todo.id, !todo.completed)"
          />
          {{ todo.title }}
        </li>
      }
    </ul>

    <div>
      <button (click)="store.addTodo('New Task')">Add Todo</button>
      <button (click)="store.todosHistory.undo()" [disabled]="!store.todosHistory.canUndo()">
        Undo
      </button>
      <button (click)="store.todosHistory.redo()" [disabled]="!store.todosHistory.canRedo()">
        Redo
      </button>
    </div>
  `,
})
export class AppComponent {
  protected store = inject(AppStore);
}
```

## 🎯 Is this right for my project?

- **Zero Learning Curve:** If you know Angular services and Signals, you already know how to use this library. There are no complex reducers or RxJS streams to untangle.
- **Feature-Packed:** Despite being incredibly lightweight, it delivers powerful api's: entity management, undo/redo history, and cross-tab syncing—straight out of the box.
- **Minimal Boilerplate:** You can set up a fully functional, reactive store in just a few lines of code, keeping your project clean, readable, and highly maintainable.

Happy coding! ✨
