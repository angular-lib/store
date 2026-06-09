import { Component, inject } from '@angular/core';
import { DemoStore, Todo } from './todo.store';

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly store = inject(DemoStore);

  addTodo(event: Event, text: string) {
    event.preventDefault();
    if (!text.trim()) return;

    const newTodo: Todo = {
      id: Date.now(),
      text: text.trim(),
      completed: false,
    };

    this.store.todoList.addOne(newTodo);
  }

  toggleTodo(todo: Todo) {
    this.store.todoList.setOne({
      ...todo,
      completed: !todo.completed,
    });
  }

  removeTodo(id: number) {
    this.store.todoList.removeOne(id);
    if (this.store.get('selectedTodoId') === id) {
      this.store.set('selectedTodoId', null);
    }
  }

  selectTodo(id: number) {
    this.store.set('selectedTodoId', id);
  }

  updateDoc(event: Event) {
    const input = event.target as HTMLTextAreaElement;
    this.store.set('dummyDoc', input.value);
  }
}
