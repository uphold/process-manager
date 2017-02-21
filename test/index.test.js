/* eslint require-yield: 0, no-console: 0 */

/**
 * Module Dependencies.
 */

const ProcessManager = require('..').constructor;

/**
 * Test `ProcessManager`.
 */

describe('ProcessManager', () => {
  let processManager;

  beforeEach(() => {
    spyOn(process, 'exit');
    spyOn(console, 'error');

    processManager = new ProcessManager();
  });

  describe('constructor()', () => {
    test('sets the initial state', () => {
      expect(processManager.errors).toEqual([]);
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

      processManager.addHook(type, handler);

      expect(processManager.hooks).toEqual([{ handler, type }]);
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

      expect(process.exit).toBeCalled();
    });

    test('sets `process.exitCode` to 1 if there are errors', () => {
      processManager.errors = [new Error()];

      processManager.exit();

      expect(process.exit).toBeCalled();
      expect(process.exit).toBeCalledWith(1);
    });

    test('calls `console.error` if `DEBUG` is not set', () => {
      processManager.errors = [new Error()];

      processManager.exit();

      expect(console.error).toBeCalled();
      expect(console.error).toBeCalledWith(...processManager.errors);
    });

    test('does not call `console.error` if `DEBUG` is set', () => {
      process.env.DEBUG = 'foo';
      processManager.errors = [new Error()];

      processManager.exit();

      expect(console.error).not.toBeCalled();

      delete process.env.DEBUG;
    });
  });

  describe('hook()', () => {
    test('calls all handlers for a given hook', () => {
      const [h1, h2] = [jest.fn(), jest.fn()];
      const type = 'disconnect';

      processManager.addHook(type, h1);
      processManager.addHook(type, h2);

      return processManager.hook(type)
      .then(() => {
        expect(h1).toBeCalled();
        expect(h2).toBeCalled();
      });
    });

    test(`doesn't call handlers that don't belong to a given hook`, () => {
      const [h1, h2] = [jest.fn(), jest.fn()];
      const type = 'disconnect';

      processManager.addHook(type, h1);
      processManager.addHook('otherHook', h2);

      return processManager.hook(type)
      .then(() => {
        expect(h1).toBeCalled();
        expect(h2).not.toBeCalled();
      });
    });

    test('passes extra arguments to the handlers', () => {
      const h1 = jest.fn();
      const type = 'disconnect';

      processManager.addHook(type, h1);

      return processManager.hook(type, 'foobar')
      .then(() => {
        expect(h1).toBeCalled();
        expect(h1).toBeCalledWith('foobar');
      });
    });

    test('resolves with a timeout if hook too long to finish', done => {
      const h1 = jest.fn();
      const type = 'disconnect';

      processManager.addHook(type, () => new Promise(() => {}).then(h1));

      jest.useFakeTimers();

      processManager.hook(type)
      .then(result => {
        expect(h1).not.toBeCalled();
        expect(result.message).toBe(`Timeout: hook 'disconnect' took too long to run.`);

        jest.useRealTimers();
        done();
      });

      jest.runAllTimers();
    });

    test('if a hook throws, it returns the error in an array', () => {
      const error = new Error('foo');
      const handler = () => { throw error; };
      const type = 'disconnect';

      processManager.addHook(type, handler);

      return processManager.hook(type)
        .then(errors => {
          expect(errors).toContain(error);
        });
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
      spyOn(processManager, 'hook').and.callThrough();

      processManager.addHook('drain', () => {
        expect(processManager.hook).toBeCalledWith('drain');

        done();
      });

      processManager.shutdown();
    });

    test('calls hook `disconnect`', done => {
      spyOn(processManager, 'hook').and.callThrough();

      processManager.addHook('disconnect', () => {
        expect(processManager.hook).toBeCalledWith('disconnect');

        done();
      });

      processManager.shutdown();
    });

    test('calls hook `exit`', done => {
      spyOn(processManager, 'hook').and.callThrough();

      processManager.addHook('exit', () => {
        expect(processManager.hook).toBeCalledWith('exit', []);

        done();
      });

      processManager.shutdown();
    });

    test('calls `processManager.exit`', done => {
      spyOn(processManager, 'exit').and.callFake(() => {
        done();
      });

      processManager.shutdown();
    });

    test('adds error to `processManager.errors`', done => {
      const error = new Error();

      spyOn(processManager, 'exit').and.callFake(() => {
        expect(processManager.errors).toHaveLength(1);
        expect(processManager.errors).toContain(error);

        expect(processManager.exit).toBeCalled();
        expect(processManager.exit).toHaveBeenCalledTimes(1);

        done();
      });

      processManager.shutdown({ error });
    });

    test('adds errors to `processManager.errors` if called more than once', done => {
      const [e1, e2] = [new Error(), new Error()];

      spyOn(processManager, 'exit').and.callFake(() => {
        expect(processManager.errors).toHaveLength(2);
        expect(processManager.errors).toContain(e1);
        expect(processManager.errors).toContain(e2);

        expect(processManager.exit).toBeCalled();
        expect(processManager.exit).toHaveBeenCalledTimes(1);

        done();
      });

      processManager.shutdown({ error: e1 });
      processManager.shutdown({ error: e2 });
    });

    test('forces shutdown if `processManager.shutdown` is called with force `true`', done => {
      spyOn(processManager, 'exit').and.callFake(() => {
        processManager.forceShutdown.promise.catch(done);
      });

      processManager.once(function *() {
        yield new Promise(resolve => {
          setTimeout(() => {
            resolve();
          }, 5000);
        });
      });

      processManager.shutdown();
      processManager.shutdown({ force: true });
    });
  });

  describe('with generator functions', () => {
    describe('loop()', () => {
      test('loops until `terminating` is true', () => {
        const fn = jest.fn();

        let i = 0;

        return processManager.loop(function *() {
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

        spyOn(processManager, 'shutdown');

        return processManager.loop(function *() { throw error; })
        .then(() => {
          expect(processManager.shutdown).toBeCalledWith({ error });
        });
      });
    });

    describe('on()', () => {
      test('calls the given generator', () => {
        const fn = jest.fn();

        const on = processManager.on(function *() { fn(); });

        return on()
        .then(() => {
          expect(fn).toBeCalled();
        });
      });

      test('passes arguments to the given generator', () => {
        const fn = jest.fn();

        const on = processManager.on(function *(value) { fn(value); });

        return on('foo')
        .then(() => {
          expect(fn).toBeCalled();
          expect(fn).toBeCalledWith('foo');
        });
      });

      test('can be called repeatedly', () => {
        const fn = jest.fn();

        spyOn(processManager, 'shutdown');

        const on = processManager.on(function *() { fn(); });

        let i = 0;
        const onArray = [];

        for (i; i < 10; i++) {
          onArray.push(on());
        }

        return Promise.all(onArray)
        .then(() => {
          expect(fn).toHaveBeenCalledTimes(i);
          expect(processManager.shutdown).not.toBeCalled();

          processManager.shutdown();
        });
      });
    });

    describe('once()', () => {
      test('calls the given generator', () => {
        const fn = jest.fn();

        return processManager.once(function *() { fn(); })
        .then(() => {
          expect(fn).toBeCalled();
        });
      });
    });

    describe('run()', () => {
      test('does nothing if `processManager` is terminating', () => {
        const fn = jest.fn();

        processManager.terminating = true;

        const result = processManager.run(function *() { fn(); });

        expect(fn).not.toBeCalled();
        expect(result).toBeUndefined();
      });

      test('returns the coroutine', done => {
        spyOn(processManager, 'shutdown').and.callFake(() => {
          done();
        });

        const chain = processManager.run(function *() {});

        expect(chain).toBeInstanceOf(Promise);
        expect(typeof chain.id).toBe('symbol');
      });

      test('calls `shutdown` with error if an error is thrown while running the generator', () => {
        const error = new Error();

        spyOn(processManager, 'shutdown');

        return processManager.run(function *() { throw error; })
        .then(() => {
          expect(processManager.shutdown).toBeCalledWith({ error });
        });
      });

      test('calls `shutdown` after running the generator', () => {
        spyOn(processManager, 'shutdown');

        return processManager.run(function *() {})
        .then(() => {
          expect(processManager.shutdown).toBeCalledWith({ error: undefined });
        });
      });
    });
  });

  describe('with promises', () => {
    test('loop works with Promise', () => {
      const fn = jest.fn();

      let i = 0;

      return processManager.loop(() => new Promise(resolve => {
        fn();

        if (++i === 3) {
          processManager.shutdown();
        }

        resolve();
      })).then(() => {
        expect(fn).toHaveBeenCalledTimes(3);
      });
    });

    test('on works with Promise', () => {
      const fn = jest.fn();

      const on = processManager.on(() => new Promise(resolve => { fn(); resolve(); }));

      return on()
        .then(() => {
          expect(fn).toBeCalled();
        });
    });

    test('once works with Promise', () => {
      const fn = jest.fn();

      return processManager.once(() => new Promise(resolve => { fn(); resolve(); }))
        .then(() => {
          expect(fn).toBeCalled();
        });
    });
  });

  describe('event handling', () => {
    test('catches `uncaughtException`', done => {
      const processManager = require('..');

      spyOn(processManager, 'shutdown');

      const error = new Error();

      process.once('uncaughtException', () => {
        expect(processManager.shutdown).toBeCalledWith({ error, force: true });

        done();
      });

      setImmediate(() => { throw error; });
    });

    test('catches `unhandledRejection`', done => {
      const processManager = require('..');

      spyOn(processManager, 'shutdown');

      const error = new Error();

      process.once('unhandledRejection', () => {
        expect(processManager.shutdown).toBeCalledWith({ error });

        done();
      });

      Promise.reject(error);
    });

    describe('catches `SIGINT`', () => {
      test('and shuts down normally', done => {
        const processManager = require('..');

        spyOn(processManager, 'shutdown');

        process.once('SIGINT', () => {
          expect(processManager.shutdown).toHaveBeenCalled();
          expect(processManager.shutdown).toHaveBeenLastCalledWith({ force: false });

          done();
        });

        process.kill(process.pid, 'SIGINT');
      });

      test('and forces shutdown if process manager is already terminating', done => {
        const processManager = require('..');

        processManager.terminating = true;

        spyOn(processManager, 'shutdown');

        process.once('SIGINT', () => {
          processManager.terminating = false;

          expect(processManager.shutdown).toHaveBeenCalled();
          expect(processManager.shutdown).toHaveBeenLastCalledWith({ force: true });

          done();
        });

        process.kill(process.pid, 'SIGINT');
      });
    });

    test('catches `SIGTERM`', done => {
      const processManager = require('..');

      spyOn(processManager, 'shutdown');

      process.once('SIGTERM', () => {
        expect(processManager.shutdown).toBeCalled();

        done();
      });

      process.kill(process.pid, 'SIGTERM');
    });
  });
});
