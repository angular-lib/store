import { Injectable } from '@angular/core';
import { ALStore, entityPlugin, historyPlugin, resourcePlugin, persistPlugin } from '@angular-libs/store';

export interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

export interface DemoState {
  theme: 'light' | 'dark';
  todos: Todo[];
  selectedTodoId: number | null;
  dummyDoc: string;
  todoDetails: string;
}

const initialState: DemoState = {
  theme: 'light',
  todos: [
    { id: 1, text: 'Learn Angular Signals', completed: true },
    { id: 2, text: 'Explore ALStore Functional Plugins', completed: false },
    { id: 3, text: 'Build a gorgeous demo app', completed: false },
  ],
  selectedTodoId: null,
  dummyDoc: 'Welcome to ALStore documentation editor.',
  todoDetails: 'Click a todo item to fetch its detailed description asynchronously...',
};

@Injectable({ providedIn: 'root' })
export class DemoStore extends ALStore<DemoState> {
  // 1. Manage Todo items collection using entityPlugin
  readonly todoList = this.registerPlugin(entityPlugin('todos', { idField: 'id' }));

  // 2. Add full time-travel capability to the Todo list modifications
  readonly todoHistory = this.registerPlugin(historyPlugin('todos', { limit: 10 }));

  // 3. Add history to the doc editor
  readonly docHistory = this.registerPlugin(historyPlugin('dummyDoc', { limit: 20 }));

  // 4. Simulated Async Resource Plugin fetching descriptions for a selected Todo
  readonly infoResource = this.registerPlugin(
    resourcePlugin('todoDetails', {
      params: () => this.getSignal('selectedTodoId')(),
      loader: async ({ params: id, abortSignal }) => {
        if (!id) return 'Click a todo item to fetch its detailed description asynchronously...';

        // Simulate network API delay
        await new Promise((resolve) => setTimeout(resolve, 800));
        
        if (abortSignal.aborted) {
          throw new Error('Aborted');
        }

        const todoText = this.get('todos').find((t) => t.id === id)?.text;
        return `Detailed Info for Todo #${id}: "${todoText}" - Resolved successfully at ${new Date().toLocaleTimeString()}!`;
      },
    })
  );

  // 5. Selectively persist the 'theme' and 'todos' across page reloads
  readonly stateSaver = this.registerPlugin(
    persistPlugin(['theme', 'todos'], { keyPrefix: 'demo-app:' })
  );

  constructor() {
    super(initialState);
  }

  toggleTheme() {
    this.update('theme', (t) => (t === 'light' ? 'dark' : 'light'));
  }
}
