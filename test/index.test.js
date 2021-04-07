/* eslint no-console: 0 */

/**
 * Module Dependencies.
 */

const ProcessManager = require('..');
const Promise = require('bluebird');

/**
 * Test `ProcessManager`.
 */

describe('ProcessManager', () => {
  let processManager;

  beforeEach(() => {
    jest.spyOn(process, 'exit').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    processManager = new ProcessManager({
      log: { error: () => {}, info: () => {} }
    });
  });

  describe('constructor()', () => {
    test('sets the initial state', () => {
      expect(processManager.errors).toEqual([]);
      expect(processManager.forceShutdown).toMatchObject({ promise: expect.any(Promise), reject: expect.any(Function), resolve: expect.any(Function) });
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

      expect(processManager.hooks).toMatchObject([{ handler, name: 'a handler', timeoutError: new Promise.TimeoutError('a handler took too long to complete disconnect hook'), type }]);
    });

    test('identifies the hook if `name` is provided', () => {
      const handler = () => '';
      const type = 'disconnect';

      processManager.addHook({ handler, name: 'foobar', type });

      expect(processManager.hooks).toMatchObject([{ handler, name: 'foobar', timeoutError: new Promise.TimeoutError('foobar took too long to complete disconnect hook'), type }]);
    });
  });

  describe('configure()', () => {
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
    test('calls all handlers for a given hook', () => {
      const [h1, h2] = [jest.fn(), jest.fn()];
      const type = 'disconnect';

      processManager.addHook({ handler: h1, type });
      processManager.addHook({ handler: h2, type });

      return processManager.hook(type)
      .then(() => {
        expect(h1).toHaveBeenCalled();
        expect(h2).toHaveBeenCalled();
      });
    });

    test(`doesn't call handlers that don't belong to a given hook`, () => {
      const [h1, h2] = [jest.fn(), jest.fn()];
      const type = 'disconnect';

      processManager.addHook({ handler: h1, type });
      processManager.addHook({ handler: h2, type: 'otherHook' });

      return processManager.hook(type)
      .then(() => {
        expect(h1).toHaveBeenCalled();
        expect(h2).not.toHaveBeenCalled();
      });
    });

    test('passes extra arguments to the handlers', () => {
      const h1 = jest.fn();
      const type = 'disconnect';

      processManager.addHook({ handler: h1, type });

      return processManager.hook(type, 'foobar')
      .then(() => {
        expect(h1).toHaveBeenCalled();
        expect(h1).toHaveBeenCalledWith('foobar');
      });
    });

    test('resolves with a timeout if hook takes too long to finish', done => {
      const [h1, h2] = [jest.fn(), jest.fn()];
      const type = 'disconnect';

      processManager.addHook({ handler: h1, type });
      processManager.addHook({ handler: () => new Promise(() => {}).then(h2), type });

      jest.useFakeTimers();

      processManager.hook(type)
      .then(() => {
        expect(h1).toHaveBeenCalled();
        expect(h2).not.toHaveBeenCalled();

        jest.useRealTimers();
        done();
      });

      jest.runOnlyPendingTimers();
    });
  });

  describe('installHandlers()', () => {
    test('sets up `uncaughtException` shutdown handler', () => {
      const error = new Error();

      jest.spyOn(processManager, 'shutdown').mockImplementation(() => {});
      jest.spyOn(process, 'on').mockImplementation((signal, callback) => {
        if (signal === 'uncaughtException') {
          callback(error);
        }
      });

      processManager.installHandlers();

      expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));

      expect(processManager.shutdown).toHaveBeenCalledTimes(1);
      expect(processManager.shutdown).toHaveBeenCalledWith({ error });
    });

    test('sets up `unhandledRejection` shutdown handler', () => {
      const error = new Error();

      jest.spyOn(processManager, 'shutdown').mockImplementation(() => {});
      jest.spyOn(process, 'on').mockImplementation((signal, callback) => {
        if (signal === 'unhandledRejection') {
          callback(error);
        }
      });

      processManager.installHandlers();

      expect(process.on).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));

      expect(processManager.shutdown).toHaveBeenCalledTimes(1);
      expect(processManager.shutdown).toHaveBeenCalledWith({ error });
    });

    test('sets up `SIGINT` shutdown handler', () => {
      jest.spyOn(processManager, 'shutdown').mockImplementation(() => {});
      jest.spyOn(process, 'on').mockImplementation((signal, callback) => {
        if (signal === 'SIGINT') {
          callback();

          processManager.terminating = true;

          callback();
        }
      });

      processManager.installHandlers();

      expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));

      expect(processManager.shutdown).toHaveBeenCalledTimes(2);
      expect(processManager.shutdown).toHaveBeenNthCalledWith(1, { force: false });
      expect(processManager.shutdown).toHaveBeenNthCalledWith(2, { force: true });
    });

    test('sets up `SIGTERM` shutdown handler', () => {
      jest.spyOn(processManager, 'shutdown').mockImplementation(() => {});
      jest.spyOn(process, 'on').mockImplementation((signal, callback) => {
        if (signal === 'SIGTERM') {
          callback();
        }
      });

      processManager.installHandlers();

      expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));

      expect(processManager.shutdown).toHaveBeenCalledTimes(1);
      expect(processManager.shutdown).toHaveBeenCalledWith();
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
    test('loops until `terminating` is true', () => {
      const fn = jest.fn();

      let i = 0;

      return processManager.loop(async () => {
        fn();

        if (++i === 3) {
          processManager.shutdown();
        }
      }).then(() => {
        expect(fn).toHaveBeenCalledTimes(3);
      });
    });

    test('calls `shutdown` with error if an error is thrown while running the loop', () => {
      const error = new Error();

      jest.spyOn(processManager, 'shutdown');

      return processManager.loop(async () => { throw error; })
      .then(() => {
        expect(processManager.shutdown).toHaveBeenCalledWith({ error });
      });
    });
  });

  describe('on()', () => {
    test('calls the given function', () => {
      const fn = jest.fn();

      const on = processManager.on(async () => fn());

      return on()
      .then(() => {
        expect(fn).toHaveBeenCalled();
      });
    });

    test('passes arguments to the given function', () => {
      const fn = jest.fn();

      const on = processManager.on(async value => fn(value));

      return on('foo')
      .then(() => {
        expect(fn).toHaveBeenCalled();
        expect(fn).toHaveBeenCalledWith('foo');
      });
    });

    test('can be called repeatedly', () => {
      const fn = jest.fn();

      jest.spyOn(processManager, 'shutdown');

      const on = processManager.on(async () => fn());

      let i = 0;
      const onArray = [];

      for (i; i < 10; i++) {
        onArray.push(on());
      }

      return Promise.all(onArray)
      .then(() => {
        expect(fn).toHaveBeenCalledTimes(i);
        expect(processManager.shutdown).not.toHaveBeenCalled();

        processManager.shutdown();
      });
    });
  });

  describe('once()', () => {
    test('calls the given function', () => {
      const fn = jest.fn();

      return processManager.once(async () => fn())
      .then(() => {
        expect(fn).toHaveBeenCalled();
      });
    });
  });

  describe('run()', () => {
    test('does nothing if `processManager` is terminating', () => {
      const fn = jest.fn();

      processManager.terminating = true;

      const result = processManager.run(async () => fn());

      expect(fn).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    test('returns the coroutine', done => {
      jest.spyOn(processManager, 'shutdown').mockImplementation(() => {
        done();
      });

      const chain = processManager.run(async () => {});

      expect(chain.then).toBeDefined();
      expect(typeof chain.id).toBe('symbol');
    });

    test('calls `shutdown` with error if an error is thrown while running the function', () => {
      const error = new Error();

      jest.spyOn(processManager, 'shutdown');

      return processManager.run(async () => { throw error; })
      .then(() => {
        expect(processManager.shutdown).toHaveBeenCalledWith({ error });
      });
    });

    test('calls `shutdown` after running the function', () => {
      jest.spyOn(processManager, 'shutdown');

      return processManager.run(async () => {})
      .then(() => {
        expect(processManager.shutdown).toHaveBeenCalledWith({ error: undefined });
      });
    });
  });
});
