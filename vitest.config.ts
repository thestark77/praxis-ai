import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Four suites spawn a real `node` process per test -- the AST hook, the
    // CLI surface, the opencode adapter. Unloaded, one such spawn takes about
    // 90ms. On CI it hit the 5s default and failed, which is a fifty-fold
    // slowdown: the work is not slow, the machine was starved.
    //
    // The starvation is the oversubscription below. This headroom is here so a
    // busy runner does not report a scheduling problem as a broken test.
    testTimeout: 30_000,
    hookTimeout: 30_000,

    // Vitest isolates each test file in its own worker, so 40 files means 40
    // worker processes, and the subprocess suites then fork node again from
    // inside them. On a hosted runner with a couple of cores that is far more
    // concurrency than there is machine, and it showed up as a timeout on the
    // test that happened to be scheduled worst.
    //
    // Unset locally: a developer machine has the cores to use.
    maxWorkers: process.env.CI ? 4 : undefined,
  },
});
