/* eslint no-console: 0 */
'use strict';

/**
 * Module dependencies.
 */

const { afterEach, beforeEach, describe, mock, test } = require('node:test');
const assert = require('node:assert');
const utils = require('../src/utils');

/**
 * Test `ProcessManager`.
 */

describe('ProcessManager', () => {
  /** @type {import('../src/index.js')} */
  let processManager;

  beforeEach(() => {
    delete require.cache[require.resolve('../src')];
    delete require.cache[require.resolve('../src/utils')];
    mock.method(process, 'exit', () => {});
    mock.method(process, 'on', () => {});
    mock.method(console, 'error', () => {});
    mock.method(process.stderr, 'write', (data, cb) => cb?.());
    mock.method(process.stdout, 'write', (data, cb) => cb?.());

    mock.method(utils, 'getDefaultLogger', () => ({ error: () => {}, info: () => {}, warn: () => {} }));

    processManager = require('../src');
  });

  afterEach(() => {
    mock.restoreAll();
  });

  describe('constructor()', () => {
    test('sets the initial state', () => {
      assert.deepStrictEqual(processManager.errors, []);
      assert.deepStrictEqual(processManager.hooks, []);
      assert.deepStrictEqual(processManager.running, new Set());
      assert.strictEqual(processManager.terminating, false);
      assert.strictEqual(processManager.timeout, 30000);
    });
  });

  describe('addHook()', () => {
    test('adds the given handler to the handlers list', () => {
      const handler = () => '';
      const type = 'disconnect';

      assert.deepStrictEqual(processManager.hooks, []);

      processManager.addHook({ handler, type });

      assert.strictEqual(processManager.hooks.length, 1);
      assert.strictEqual(processManager.hooks[0].handler, handler);
      assert.strictEqual(processManager.hooks[0].name, 'a handler');
      assert.strictEqual(
        processManager.hooks[0].timeoutError.message,
        'a handler took too long to complete disconnect hook'
      );
      assert.strictEqual(processManager.hooks[0].type, type);
    });

    test('identifies the hook if `name` is provided', () => {
      const handler = () => '';
      const type = 'disconnect';

      processManager.addHook({ handler, name: 'foobar', type });

      assert.strictEqual(processManager.hooks.length, 1);
      assert.strictEqual(processManager.hooks[0].handler, handler);
      assert.strictEqual(processManager.hooks[0].name, 'foobar');
      assert.strictEqual(
        processManager.hooks[0].timeoutError.message,
        'foobar took too long to complete disconnect hook'
      );
      assert.strictEqual(processManager.hooks[0].type, type);
    });
  });

  describe('configure()', () => {
    test('keeps old logger instance if nothing is passed', () => {
      const currentLogger = processManager.log;

      assert.strictEqual(processManager.log, currentLogger);

      processManager.configure();

      assert.strictEqual(processManager.log, currentLogger);
    });

    test('throws an error if the logger instance is invalid', () => {
      assert.throws(() => processManager.configure({ log: 'foo' }), new Error('Logger instance is invalid'));
    });

    test('throws an error if the logger instance is missing a method', () => {
      assert.throws(
        () => processManager.configure({ log: {} }),
        new Error(`Logger instance is missing required log method 'info'`)
      );
    });

    test('throws an error if a logger instance method is not a function', () => {
      assert.throws(
        () => processManager.configure({ log: { info: 'foo' } }),
        new Error(`Logger instance log method 'info' is not a function`)
      );
    });

    test('updates the logger instance', () => {
      const newLogger = { error: () => {}, info: () => {}, warn: () => {} };
      const oldLogger = processManager.log;

      assert.strictEqual(processManager.log, oldLogger);

      processManager.configure({ log: newLogger });

      assert.strictEqual(processManager.log, newLogger);
      assert.notStrictEqual(processManager.log, oldLogger);
    });

    test('keeps old timeout if nothing is passed', () => {
      assert.strictEqual(processManager.timeout, 30000);

      processManager.configure();

      assert.strictEqual(processManager.timeout, 30000);
    });

    test('keeps old timeout if value is NaN', () => {
      assert.strictEqual(processManager.timeout, 30000);

      processManager.configure({ timeout: 'foo' });

      assert.strictEqual(processManager.timeout, 30000);
    });

    test('updates timeout', () => {
      assert.strictEqual(processManager.timeout, 30000);

      processManager.configure({ timeout: 20000 });

      assert.strictEqual(processManager.timeout, 20000);
    });
  });

  describe('exit()', () => {
    test('calls `process.exit`', () => {
      processManager.exit();

      assert.strictEqual(process.exit.mock.calls.length > 0, true);
    });

    test('sets `process.exitCode` to 1 if there are errors', () => {
      processManager.errors = [new Error()];

      processManager.exit();

      assert.strictEqual(process.exit.mock.calls.length > 0, true);
      assert.strictEqual(process.exit.mock.calls[process.exit.mock.calls.length - 1].arguments[0], 1);
    });
  });

  describe('hook()', () => {
    test('calls all handlers for a given hook', async () => {
      const [h1, h2] = [mock.fn(), mock.fn()];
      const type = 'disconnect';

      processManager.addHook({ handler: h1, type });
      processManager.addHook({ handler: h2, type });
      processManager.configure({ timeout: 1 });

      await processManager.hook(type);

      assert.strictEqual(h1.mock.calls.length > 0, true);
      assert.strictEqual(h2.mock.calls.length > 0, true);
    });

    test(`doesn't call handlers that don't belong to a given hook`, async () => {
      const [h1, h2] = [mock.fn(), mock.fn()];
      const type = 'disconnect';

      processManager.addHook({ handler: h1, type });
      processManager.addHook({ handler: h2, type: 'otherHook' });
      processManager.configure({ timeout: 1 });

      await processManager.hook(type);

      assert.strictEqual(h1.mock.calls.length > 0, true);
      assert.strictEqual(h2.mock.calls.length, 0);
    });

    test('passes extra arguments to the handlers', async () => {
      const h1 = mock.fn();
      const type = 'disconnect';

      processManager.addHook({ handler: h1, type });
      processManager.configure({ timeout: 1 });

      await processManager.hook(type, 'foobar');

      assert.strictEqual(h1.mock.calls.length > 0, true);
      assert.strictEqual(h1.mock.calls[0].arguments[0], 'foobar');
    });

    test('resolves with a timeout if hook takes too long to finish', async () => {
      const [h1, h2] = [mock.fn(), mock.fn()];
      const type = 'disconnect';

      processManager.addHook({ handler: h1, type });
      processManager.addHook({ handler: () => new Promise(() => {}).then(h2), type });
      processManager.configure({ timeout: 1 });

      await processManager.hook(type);

      assert.strictEqual(h1.mock.calls.length > 0, true);
      assert.strictEqual(h2.mock.calls.length, 0);
    });

    test('adds handler errors to `processManager.errors`', async () => {
      const type = 'disconnect';

      processManager.addHook({
        handler: () => {
          throw new Error();
        },
        type
      });
      processManager.addHook({
        handler: () => {
          // This should be ignored since it's not an Error instance.
          return 'foo';
        },
        type
      });
      processManager.configure({ timeout: 1 });

      assert.strictEqual(processManager.errors.length, 0);

      await processManager.hook(type);

      assert.strictEqual(processManager.errors.length, 1);
    });
  });

  describe('shutdown()', () => {
    test('sets `processManager.terminating` to true', () => {
      processManager.shutdown();

      assert.strictEqual(processManager.terminating, true);
    });

    test('calls `processManager.exit()` if `force` is set to `true`', async () => {
      mock.method(processManager, 'exit', () => {});

      await processManager.shutdown({ force: true });

      assert.strictEqual(processManager.exit.mock.calls.length, 1);
    });

    test('calls hook `drain`', async () => {
      mock.method(processManager, 'hook', () => {});

      processManager.addHook({ handler() {}, type: 'drain' });

      await processManager.shutdown();

      assert.strictEqual(
        processManager.hook.mock.calls.some(call => call.arguments[0] === 'drain'),
        true
      );
    });

    test('calls hook `disconnect`', async () => {
      mock.method(processManager, 'hook', () => {});

      processManager.addHook({ handler() {}, type: 'disconnect' });

      await processManager.shutdown();

      assert.strictEqual(
        processManager.hook.mock.calls.some(call => call.arguments[0] === 'disconnect'),
        true
      );
    });

    test('calls hook `exit`', async () => {
      mock.method(processManager, 'hook', () => {});

      processManager.addHook({ handler() {}, type: 'exit' });

      await processManager.shutdown();

      assert.strictEqual(
        processManager.hook.mock.calls.some(
          call => call.arguments[0] === 'exit' && JSON.stringify(call.arguments[1]) === '[]'
        ),
        true
      );
    });

    test('flushes stdout and stderr', async () => {
      await processManager.shutdown();

      assert.strictEqual(process.stdout.write.mock.calls.length, 1);
      assert.strictEqual(process.stdout.write.mock.calls[0].arguments[0], '');
      assert.strictEqual(typeof process.stdout.write.mock.calls[0].arguments[1], 'function');
      assert.strictEqual(process.stderr.write.mock.calls.length, 1);
      assert.strictEqual(process.stderr.write.mock.calls[0].arguments[0], '');
    });

    test('calls `processManager.exit()`', async () => {
      mock.method(processManager, 'exit', () => {});

      await processManager.shutdown();

      assert.strictEqual(processManager.exit.mock.calls.length, 1);
    });

    test('adds error to `processManager.errors`', async () => {
      const error = new Error();

      mock.method(processManager, 'exit', () => {});

      await processManager.shutdown({ error });

      assert.strictEqual(processManager.errors.length, 1);
      assert.strictEqual(processManager.errors.includes(error), true);
    });

    test('adds errors to `processManager.errors` if called more than once', async () => {
      const [e1, e2] = [new Error(), new Error()];

      mock.method(processManager, 'exit', () => {});

      await Promise.all([processManager.shutdown({ error: e1 }), processManager.shutdown({ error: e2 })]);

      assert.strictEqual(processManager.errors.length, 2);
      assert.strictEqual(processManager.errors.includes(e1), true);
      assert.strictEqual(processManager.errors.includes(e2), true);
    });

    test('forces shutdown if `processManager.shutdown()` is called with force `true`', async () => {
      const deferred = utils.deferred();

      mock.method(processManager, 'exit', () => {});

      processManager.once(async () => {
        await deferred.promise;
      });

      await processManager.shutdown({ force: true });

      assert.strictEqual(processManager.exit.mock.calls.length, 1);

      deferred.resolve();
    });
  });

  describe('loop()', () => {
    test('loops until `terminating` is true', async () => {
      const fn = mock.fn();

      let i = 0;

      await processManager.loop(() => {
        fn();

        if (++i === 3) {
          processManager.shutdown();
        }
      });

      assert.strictEqual(fn.mock.calls.length, 3);
    });

    test('handles dynamic interval', async () => {
      const utils = require('../src/utils');

      mock.method(utils, 'timeout', () => {});
      const fn = mock.fn();

      let i = 0;

      await processManager.loop(
        () => {
          fn();

          if (++i === 3) {
            processManager.shutdown();
          }

          return i > 1 ? { interval: 1 } : undefined;
        },
        { interval: 10 }
      );

      assert.strictEqual(fn.mock.calls.length, 3);
      assert.strictEqual(utils.timeout.mock.calls.length, 2);
      assert.strictEqual(utils.timeout.mock.calls[0].arguments[0], 10);
      assert.strictEqual(utils.timeout.mock.calls[1].arguments[0], 1);
    });

    test('calls `shutdown` with error if an error is thrown while running the loop', async () => {
      const error = new Error();

      mock.method(processManager, 'shutdown');

      await processManager.loop(() => {
        throw error;
      });

      assert.strictEqual(
        processManager.shutdown.mock.calls.some(call => call.arguments[0]?.error === error),
        true
      );
    });
  });

  describe('on()', () => {
    test('calls the given function', async () => {
      const fn = mock.fn();

      const on = processManager.on(() => fn());

      await on();

      assert.strictEqual(fn.mock.calls.length > 0, true);
    });

    test('passes arguments to the given function', async () => {
      const fn = mock.fn();

      const on = processManager.on(value => fn(value));

      await on('foo');

      assert.strictEqual(fn.mock.calls.length > 0, true);
      assert.strictEqual(fn.mock.calls[0].arguments[0], 'foo');
    });

    test('can be called repeatedly', async () => {
      const fn = mock.fn();

      mock.method(processManager, 'shutdown');

      const on = processManager.on(() => fn());

      let i = 0;
      const onArray = [];

      for (i; i < 10; i++) {
        onArray.push(on());
      }

      await Promise.all(onArray);

      assert.strictEqual(fn.mock.calls.length, i);
      assert.strictEqual(processManager.shutdown.mock.calls.length, 0);
    });
  });

  describe('once()', () => {
    test('calls the given function', async () => {
      const fn = mock.fn();

      await processManager.once(() => fn());

      assert.strictEqual(fn.mock.calls.length > 0, true);
    });
  });

  describe('run()', () => {
    test('does nothing if `processManager.terminating` is true', async () => {
      const fn = mock.fn();

      processManager.terminating = true;

      await processManager.run(fn);

      assert.strictEqual(fn.mock.calls.length, 0);
    });

    test('calls `processManager.shutdown()` with error if an error is thrown while running the function', async () => {
      const error = new Error();

      mock.method(processManager, 'shutdown');

      await processManager.run(() => {
        throw error;
      });

      assert.strictEqual(
        processManager.shutdown.mock.calls.some(call => call.arguments[0]?.error === error),
        true
      );
    });

    test('calls `shutdown` after running the function', async () => {
      mock.method(processManager, 'shutdown');

      await processManager.run(() => {});

      assert.strictEqual(
        processManager.shutdown.mock.calls.some(call => call.arguments[0]?.error === undefined),
        true
      );
    });
  });

  describe('event handling', () => {
    test('it sets event handlers', () => {
      assert.strictEqual(
        process.on.mock.calls.some(
          call => call.arguments[0] === 'uncaughtException' && typeof call.arguments[1] === 'function'
        ),
        true
      );
      assert.strictEqual(
        process.on.mock.calls.some(
          call => call.arguments[0] === 'unhandledRejection' && typeof call.arguments[1] === 'function'
        ),
        true
      );
      assert.strictEqual(
        process.on.mock.calls.some(call => call.arguments[0] === 'SIGINT' && typeof call.arguments[1] === 'function'),
        true
      );
      assert.strictEqual(
        process.on.mock.calls.some(call => call.arguments[0] === 'SIGTERM' && typeof call.arguments[1] === 'function'),
        true
      );
    });

    test('it handles `uncaughtException` events', () => {
      processManager.configure({ timeout: 1 });

      const [, uncaughtExceptionEventFunction] = process.on.mock.calls.find(([event]) => event === 'uncaughtException');

      mock.method(processManager, 'shutdown');

      // Simulate `uncaughtException`.
      uncaughtExceptionEventFunction('foo');

      assert.strictEqual(processManager.shutdown.mock.calls.length, 1);
      assert.strictEqual(processManager.shutdown.mock.calls[0].arguments[0].error, 'foo');
    });

    test('it handles `unhandledRejection` events', () => {
      processManager.configure({ timeout: 1 });

      const [, unhandledRejectionEventFunction] = process.on.mock.calls.find(
        ([event]) => event === 'unhandledRejection'
      );

      mock.method(processManager, 'shutdown');

      // Simulate `unhandledRejection`.
      unhandledRejectionEventFunction('foo');

      assert.strictEqual(processManager.shutdown.mock.calls.length, 1);
      assert.strictEqual(processManager.shutdown.mock.calls[0].arguments[0].error, 'foo');
    });

    test('it handles `SIGINT` events', () => {
      processManager.configure({ timeout: 1 });

      const [, sigintEventFunction] = process.on.mock.calls.find(([event]) => event === 'SIGINT');

      mock.method(processManager, 'shutdown');

      // Simulate two SIGINT events.
      sigintEventFunction();
      sigintEventFunction();

      assert.strictEqual(processManager.shutdown.mock.calls.length, 2);
      assert.strictEqual(processManager.shutdown.mock.calls[0].arguments[0].force, false);
      assert.strictEqual(processManager.shutdown.mock.calls[1].arguments[0].force, true);
    });

    test('it handles `SIGTERM` events', () => {
      processManager.configure({ timeout: 1 });

      const [, sigtermEventFunction] = process.on.mock.calls.find(([event]) => event === 'SIGTERM');

      mock.method(processManager, 'shutdown');

      // Simulate SIGTERM.
      sigtermEventFunction();

      assert.strictEqual(processManager.shutdown.mock.calls.length, 1);
      assert.strictEqual(processManager.shutdown.mock.calls[0].arguments.length, 0);
    });
  });
});
