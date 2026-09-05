import { describe, expect, test, vi } from "vitest";
import { DiagramRenderQueue } from "../src/diagram-render-queue.js";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("DiagramRenderQueue", () => {
  test("caps active renders and continues after a failure", async () => {
    const queue = new DiagramRenderQueue(2);
    const gates = [deferred<number>(), deferred<number>(), deferred<number>()];
    let active = 0;
    let peak = 0;
    const tasks = gates.map((gate, index) =>
      queue.enqueue(async () => {
        active += 1;
        peak = Math.max(peak, active);
        const value = await gate.promise;
        active -= 1;
        if (index === 0) throw new Error("synthetic failure");
        return value;
      }),
    );

    expect(peak).toBe(2);
    gates[0].resolve(0);
    await expect(tasks[0]).rejects.toThrow("synthetic failure");
    await vi.waitFor(() => expect(peak).toBe(2));
    gates[1].resolve(1);
    gates[2].resolve(2);
    await expect(Promise.all(tasks.slice(1))).resolves.toEqual([1, 2]);
    expect(peak).toBe(2);
  });

  test("runs higher-priority pending work first", async () => {
    const queue = new DiagramRenderQueue(1);
    const gate = deferred<string>();
    const order: string[] = [];
    const first = queue.enqueue(async () => {
      order.push("first");
      return gate.promise;
    });
    const low = queue.enqueue(async () => {
      order.push("low");
      return "low";
    });
    const high = queue.enqueue(
      async () => {
        order.push("high");
        return "high";
      },
      { priority: 10 },
    );

    gate.resolve("first");
    await expect(Promise.all([first, low, high])).resolves.toEqual([
      "first",
      "low",
      "high",
    ]);
    expect(order).toEqual(["first", "high", "low"]);
  });

  test("releases slots after synchronous failures in immediate and pending tasks", async () => {
    const queue = new DiagramRenderQueue(1);
    const fail = () => {
      throw new Error("sync failure");
    };
    const immediate = queue.enqueue(fail);
    await expect(immediate).rejects.toThrow("sync failure");
    const gate = deferred<string>();
    const active = queue.enqueue(() => gate.promise);
    const pending = queue.enqueue(fail);
    const next = queue.enqueue(async () => "continued");
    const settled = Promise.allSettled([active, pending, next]);
    gate.resolve("active");
    expect(await settled).toMatchObject([
      { status: "fulfilled", value: "active" },
      { status: "rejected", reason: { message: "sync failure" } },
      { status: "fulfilled", value: "continued" },
    ]);
  });

  test("promotes the matching pending task without duplicating or cancelling work", async () => {
    const queue = new DiagramRenderQueue(1);
    const gate = deferred<string>();
    const active = queue.enqueue(() => gate.promise);
    const order: string[] = [];
    const tasks = ["offscreen", "visible"].map((key) =>
      queue.enqueue(
        async () => {
          order.push(key);
          return key;
        },
        { group: "theme", generation: 2, key },
      ),
    );
    expect(queue.reprioritize("theme", 1, "visible", 100)).toBe(false);
    expect(queue.reprioritize("initial", 2, "visible", 100)).toBe(false);
    expect(queue.reprioritize("theme", 2, "visible", 100)).toBe(true);
    gate.resolve("active");
    await Promise.all([active, ...tasks]);
    expect(order).toEqual(["visible", "offscreen"]);
  });

  test("aborts stale pending and active generations", async () => {
    const queue = new DiagramRenderQueue(1);
    const active = queue.enqueue(
      (signal) =>
        new Promise<string>((resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason));
          setTimeout(() => resolve("stale"), 1_000);
        }),
      { generation: 1, group: "theme" },
    );
    const pending = queue.enqueue(async () => "pending", {
      generation: 1,
      group: "theme",
    });

    queue.cancelOlder("theme", 2);

    await expect(active).rejects.toMatchObject({ name: "AbortError" });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      queue.enqueue(async () => "latest", {
        generation: 2,
        group: "theme",
      }),
    ).resolves.toBe("latest");
  });
});
