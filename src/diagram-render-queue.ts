export interface DiagramRenderTaskOptions {
  generation?: number;
  group?: string;
  key?: string;
  priority?: number;
}

interface QueuedTask {
  controller: AbortController;
  generation: number;
  group: string;
  key?: string;
  priority: number;
  reject: (reason?: unknown) => void;
  resolve: (value: unknown) => void;
  run: (signal: AbortSignal) => Promise<unknown>;
  sequence: number;
}

function abortError(): DOMException {
  return new DOMException("Diagram render was superseded.", "AbortError");
}

export class DiagramRenderQueue {
  readonly concurrency: number;
  #active = new Set<QueuedTask>();
  #pending: QueuedTask[] = [];
  #sequence = 0;

  constructor(concurrency = 2) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error("Diagram render concurrency must be a positive integer.");
    }
    this.concurrency = concurrency;
  }

  enqueue<T>(
    run: (signal: AbortSignal) => Promise<T>,
    options: DiagramRenderTaskOptions = {},
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.#pending.push({
        controller: new AbortController(),
        generation: options.generation ?? 0,
        group: options.group ?? "default",
        key: options.key,
        priority: options.priority ?? 0,
        reject,
        resolve: (value) => resolve(value as T),
        run,
        sequence: this.#sequence++,
      });
      this.#pending.sort(
        (a, b) => b.priority - a.priority || a.sequence - b.sequence,
      );
      this.#drain();
    });
  }

  reprioritize(
    group: string,
    generation: number,
    key: string,
    priority: number,
  ): boolean {
    const task = this.#pending.find(
      (candidate) =>
        candidate.group === group &&
        candidate.generation === generation &&
        candidate.key === key,
    );
    if (!task || priority <= task.priority) return false;
    task.priority = priority;
    this.#pending.sort(
      (a, b) => b.priority - a.priority || a.sequence - b.sequence,
    );
    return true;
  }

  cancelOlder(group: string, generation: number): void {
    const reason = abortError();
    const retained: QueuedTask[] = [];
    for (const task of this.#pending) {
      if (task.group === group && task.generation < generation) {
        task.controller.abort(reason);
        task.reject(reason);
      } else {
        retained.push(task);
      }
    }
    this.#pending = retained;
    for (const task of this.#active) {
      if (task.group === group && task.generation < generation) {
        task.controller.abort(reason);
      }
    }
  }

  destroy(): void {
    const reason = abortError();
    for (const task of this.#pending) {
      task.controller.abort(reason);
      task.reject(reason);
    }
    this.#pending = [];
    for (const task of this.#active) task.controller.abort(reason);
  }

  async #run(task: QueuedTask): Promise<void> {
    try {
      task.controller.signal.throwIfAborted();
      task.resolve(await task.run(task.controller.signal));
    } catch (error) {
      task.reject(error);
    } finally {
      this.#active.delete(task);
      this.#drain();
    }
  }

  #drain(): void {
    while (this.#active.size < this.concurrency) {
      const task = this.#pending.shift();
      if (!task) return;
      this.#active.add(task);
      void this.#run(task);
    }
  }
}
