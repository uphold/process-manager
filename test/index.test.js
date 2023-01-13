/* eslint no-console: 0 */

/**
 * Test `ProcessManager`.
 */

describe('ProcessManager', () => {
  let processManager;

  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(process, 'exit').mockImplementation(() => {});
    jest.spyOn(process, 'on').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const utils = require('../src/utils');

    jest
      .spyOn(utils, 'getDefaultLogger')
      .mockImplementationOnce(() => ({ error: () => {}, info: () => {}, warn: () => {} }));

    processManager = require('../src');
  });

  describe('constructor()', () => {
    test('sets the initial state', () => {
      expect(processManager.errors).toEqual([]);
      expect(processManager.forceShutdown).toMatchObject({
        promise: expect.any(Promise),
        reject: expect.any(Function),
        resolve: expect.any(Function)
      });
      expect(processManager.hooks).toEqual([]);
      expect(processManager.running).toEqual([]);
      expect(processManager.terminating).toEqual(false);
      expect(processManager.timeout).toEqual(30000);
    });
  });

  describe('addHook()', () => {
    test('adds the given handler to the handlers list', () => {
      const handler = () => '';
      const type = 'disconnect';

      expect(processManager.hooks).toEqual([]);

      processManager.addHook({ handler, type });

      expect(processManager.hooks).toMatchObject([
        {
          handler,
          name: 'a handler',
          timeoutError: { message: 'a handler took too long to complete disconnect hook' },
          type
        }
      ]);
    });

    test('identifies the hook if `name` is provided', () => {
      const handler = () => '';
      const type = 'disconnect';

      processManager.addHook({ handler, name: 'foobar', type });

      expect(processManager.hooks).toMatchObject([
        { handler, name: 'foobar', timeoutError: { message: 'foobar took too long to complete disconnect hook' }, type }
      ]);
    });
  });

  describe('configure()', () => {
    test('keeps old logger instance if nothing is passed', () => {
      const currentLogger = processManager.log;

      expect(processManager.log).toBe(currentLogger);

      processManager.configure();

      expect(processManager.log).toBe(currentLogger);
    });

    test('throws an error if the logger instance is invalid', () => {
      expect(() => processManager.configure({ log: 'foo' })).toThrow(new Error('Logger instance is invalid'));
    });

    test('throws an error if the logger instance is missing a method', () => {
      expect(() => processManager.configure({ log: {} })).toThrow(
        new Error(`Logger instance is missing required log method 'info'`)
      );
    });

    test('throws an error if a logger instance method is not a function', () => {
      expect(() => processManager.configure({ log: { info: 'foo' } })).toThrow(
        new Error(`Logger instance log method 'info' is not a function`)
      );
    });

    test('updates the logger instance', () => {
      const newLogger = { error: () => {}, info: () => {}, warn: () => {} };
      const oldLogger = processManager.log;

      expect(processManager.log).toBe(oldLogger);

      processManager.configure({ log: newLogger });

      expect(processManager.log).toBe(newLogger);
      expect(processManager.log).not.toBe(oldLogger);
    });

    test('keeps old timeout if nothing is passed', () => {
      expect(processManager.timeout).toBe(30000);

      processManager.configure();

      expect(processManager.timeout).toBe(30000);
    });

    test('keeps old timeout if value is NaN', () => {
      expect(processManager.timeout).toBe(30000);

      processManager.configure({ timeout: 'foo' });

      expect(processManager.timeout).toBe(30000);
    });

    test('updates timeout', () => {
      expect(processManager.timeout).toBe(30000);

      processManager.configure({ timeout: 20000 });

      expect(processManager.timeout).toBe(20000);
    });
  });

  describe('exit()', () => {
    test('calls `process.exit`', () => {
      processManager.exit();

      expect(process.exit).toHaveBeenCalled();
    });

    test('sets `process.exitCode` to 1 if there are errors', () => {
      processManager.errors = [new Error()];

      processManager.exit();

      expect(process.exit).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    test('calls `console.error` if `DEBUG` is not set', () => {
      processManager.errors = [new Error()];

      processManager.exit();

      expect(console.error).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(...processManager.errors);
    });

    test('does not call `console.error` if `DEBUG` is set', () => {
      process.env.DEBUG = 'foo';
      processManager.errors = [new Error()];

      processManager.exit();

      expect(console.error).not.toHaveBeenCalled();

      delete process.env.DEBUG;
    });
  });

  describe('hook()', () => {
    test('calls all handlers for a given hook', async () => {
      const [h1, h2] = [jest.fn(), jest.fn()];
      const type = 'disconnect';

      processManager.addHook({ handler: h1, type });
      processManager.addHook({ handler: h2, type });
      processManager.configure({ timeout: 1 });

      await processManager.hook(type);

      expect(h1).toHaveBeenCalled();
      expect(h2).toHaveBeenCalled();
    });

    test(`doesn't call handlers that don't belong to a given hook`, async () => {
      const [h1, h2] = [jest.fn(), jest.fn()];
      const type = 'disconnect';

      processManager.addHook({ handler: h1, type });
      processManager.addHook({ handler: h2, type: 'otherHook' });
      processManager.configure({ timeout: 1 });

      await processManager.hook(type);

      expect(h1).toHaveBeenCalled();
      expect(h2).not.toHaveBeenCalled();
    });

    test('passes extra arguments to the handlers', async () => {
      const h1 = jest.fn();
      const type = 'disconnect';

      processManager.addHook({ handler: h1, type });
      processManager.configure({ timeout: 1 });

      await processManager.hook(type, 'foobar');

      expect(h1).toHaveBeenCalled();
      expect(h1).toHaveBeenCalledWith('foobar');
    });

    test('resolves with a timeout if hook takes too long to finish', async () => {
      const [h1, h2] = [jest.fn(), jest.fn()];
      const type = 'disconnect';

      processManager.addHook({ handler: h1, type });
      processManager.addHook({ handler: () => new Promise(() => {}).then(h2), type });
      processManager.configure({ timeout: 1 });

      await processManager.hook(type);

      expect(h1).toHaveBeenCalled();
      expect(h2).not.toHaveBeenCalled();
    });

    test('adds handler errors to `processManager.errors`', async () => {
      const type = 'disconnect';

      processManager.addHook({
        handler: () => {
          throw new Error();
        },
        type
      });
      processManager.configure({ timeout: 1 });

      expect(processManager.errors).toHaveLength(0);

      await processManager.hook(type);

      expect(processManager.errors).toHaveLength(1);
    });
  });

  describe('shutdown()', () => {
    test('sets `terminating` to true', () => {
      processManager.shutdown();

      expect(processManager.terminating).toBe(true);
    });

    test('creates `forceShutdown` promise', () => {
      processManager.shutdown();

      expect(processManager.forceShutdown.promise).toBeInstanceOf(Promise);
    });

    test('with `force` set to `true` it creates `forceShutdown` promise in reject state', done => {
      processManager.shutdown({ force: true });

      processManager.forceShutdown.promise.catch(done);
    });

    test('calls hook `drain`', done => {
      jest.spyOn(processManager, 'hook');

      processManager.addHook({
        handler() {
          expect(processManager.hook).toHaveBeenCalledWith('drain');

          done();
        },
        type: 'drain'
      });
      processManager.configure({ timeout: 1 });

      processManager.shutdown();
    });

    test('calls hook `disconnect`', done => {
      jest.spyOn(processManager, 'hook');

      processManager.addHook({
        handler() {
          expect(processManager.hook).toHaveBeenCalledWith('disconnect');

          done();
        },
        type: 'disconnect'
      });
      processManager.configure({ timeout: 1 });

      processManager.shutdown();
    });

    test('calls hook `exit`', done => {
      jest.spyOn(processManager, 'hook');

      processManager.addHook({
        handler() {
          expect(processManager.hook).toHaveBeenCalledWith('exit', []);

          done();
        },
        type: 'exit'
      });
      processManager.configure({ timeout: 1 });

      processManager.shutdown();
    });

    test('calls `processManager.exit`', done => {
      jest.spyOn(processManager, 'exit').mockImplementation(() => {
        done();
      });

      processManager.shutdown();
    });

    test('adds error to `processManager.errors`', done => {
      const error = new Error();

      jest.spyOn(processManager, 'exit').mockImplementation(() => {
        expect(processManager.errors).toHaveLength(1);
        expect(processManager.errors).toContain(error);

        expect(processManager.exit).toHaveBeenCalled();
        expect(processManager.exit).toHaveBeenCalledTimes(1);

        done();
      });

      processManager.shutdown({ error });
    });

    test('adds errors to `processManager.errors` if called more than once', done => {
      const [e1, e2] = [new Error(), new Error()];

      jest.spyOn(processManager, 'exit').mockImplementation(() => {
        expect(processManager.errors).toHaveLength(2);
        expect(processManager.errors).toContain(e1);
        expect(processManager.errors).toContain(e2);

        expect(processManager.exit).toHaveBeenCalled();
        expect(processManager.exit).toHaveBeenCalledTimes(1);

        done();
      });

      processManager.shutdown({ error: e1 });
      processManager.shutdown({ error: e2 });
    });

    test('forces shutdown if `processManager.shutdown` is called with force `true`', done => {
      jest.spyOn(processManager, 'exit').mockImplementation(() => {
        processManager.forceShutdown.promise.catch(done);
      });

      processManager.loop(async () => {}, { interval: 1000 });

      processManager.shutdown();
      processManager.shutdown({ force: true });
    });
  });

  describe('loop()', () => {
    test('loops until `terminating` is true', async () => {
      const fn = jest.fn();

      let i = 0;

      await processManager.loop(() => {
        fn();

        if (++i === 3) {
          processManager.shutdown();
        }
      });

      expect(fn).toHaveBeenCalledTimes(3);
    });

    test('calls `shutdown` with error if an error is thrown while running the loop', async () => {
      const error = new Error();

      jest.spyOn(processManager, 'shutdown');

      await processManager.loop(() => {
        throw error;
      });

      expect(processManager.shutdown).toHaveBeenCalledWith({ error });
    });
  });

  describe('on()', () => {
    test('calls the given function', async () => {
      const fn = jest.fn();

      const on = processManager.on(() => fn());

      await on();

      expect(fn).toHaveBeenCalled();
    });

    test('passes arguments to the given function', async () => {
      const fn = jest.fn();

      const on = processManager.on(value => fn(value));

      await on('foo');

      expect(fn).toHaveBeenCalled();
      expect(fn).toHaveBeenCalledWith('foo');
    });

    test('can be called repeatedly', async () => {
      const fn = jest.fn();

      jest.spyOn(processManager, 'shutdown');

      const on = processManager.on(() => fn());

      let i = 0;
      const onArray = [];

      for (i; i < 10; i++) {
        onArray.push(on());
      }

      await Promise.all(onArray);

      expect(fn).toHaveBeenCalledTimes(i);
      expect(processManager.shutdown).not.toHaveBeenCalled();
    });
  });

  describe('once()', () => {
    test('calls the given function', async () => {
      const fn = jest.fn();

      await processManager.once(() => fn());

      expect(fn).toHaveBeenCalled();
    });
  });

  describe('run()', () => {
    test('does nothing if `processManager` is terminating', () => {
      const fn = jest.fn();

      processManager.terminating = true;

      const result = processManager.run(() => fn());

      expect(fn).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    test('returns the coroutine', done => {
      jest.spyOn(processManager, 'shutdown').mockImplementation(() => {
        done();
      });

      const chain = processManager.run(() => {});

      expect(chain.then).toBeDefined();
      expect(typeof chain.id).toBe('symbol');
    });

    test('calls `shutdown` with error if an error is thrown while running the function', async () => {
      const error = new Error();

      jest.spyOn(processManager, 'shutdown');

      await processManager.run(() => {
        throw error;
      });

      expect(processManager.shutdown).toHaveBeenCalledWith({ error });
    });

    test('calls `shutdown` after running the function', async () => {
      jest.spyOn(processManager, 'shutdown');

      await processManager.run(() => {});

      expect(processManager.shutdown).toHaveBeenCalledWith({ error: undefined });
    });
  });

  describe('event handling', () => {
    test('it sets event handlers', () => {
      expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });

    test('it handles `uncaughtException` events', () => {
      processManager.configure({ timeout: 1 });

      const [, uncaughtExceptionEventFunction] = process.on.mock.calls.find(([event]) => event === 'uncaughtException');

      jest.spyOn(processManager, 'shutdown');

      // Simulate `uncaughtException`.
      uncaughtExceptionEventFunction('foo');

      expect(processManager.shutdown).toHaveBeenCalledTimes(1);
      expect(processManager.shutdown).toHaveBeenCalledWith({ error: 'foo' });
    });

    test('it handles `unhandledRejection` events', () => {
      processManager.configure({ timeout: 1 });

      const [, unhandledRejectionEventFunction] = process.on.mock.calls.find(
        ([event]) => event === 'unhandledRejection'
      );

      jest.spyOn(processManager, 'shutdown');

      // Simulate `unhandledRejection`.
      unhandledRejectionEventFunction('foo');

      expect(processManager.shutdown).toHaveBeenCalledTimes(1);
      expect(processManager.shutdown).toHaveBeenCalledWith({ error: 'foo' });
    });

    test('it handles `SIGINT` events', () => {
      processManager.configure({ timeout: 1 });

      const [, sigintEventFunction] = process.on.mock.calls.find(([event]) => event === 'SIGINT');

      jest.spyOn(processManager, 'shutdown');

      // Simulate two SIGINT events.
      sigintEventFunction();
      sigintEventFunction();

      expect(processManager.shutdown).toHaveBeenCalledTimes(2);
      expect(processManager.shutdown).toHaveBeenNthCalledWith(1, { force: false });
      expect(processManager.shutdown).toHaveBeenNthCalledWith(2, { force: true });
    });

    test('it handles `SIGTERM` events', () => {
      processManager.configure({ timeout: 1 });

      const [, sigtermEventFunction] = process.on.mock.calls.find(([event]) => event === 'SIGTERM');

      jest.spyOn(processManager, 'shutdown');

      // Simulate SIGTERM.
      sigtermEventFunction();

      expect(processManager.shutdown).toHaveBeenCalledTimes(1);
      expect(processManager.shutdown).toHaveBeenCalledWith();
    });
  });
});
