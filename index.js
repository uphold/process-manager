'use strict';

/**
 * Module dependencies.
 */

const Promise = require('bluebird');

/**
 * Auxiliary promise defer method.
 */

function deferred() {
  const deferred = {};

  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });

  return deferred;
}

/**
 * Auxiliary reflect method.
 */

function reflect(thenable, args) {
  return Promise.try(() => thenable(...args))
    .then(() => {}, error => error);
}

/**
 * Class `ProcessManager`.
 */

class ProcessManager {

  /**
   * Constructor.
   */

  constructor({ log }) {
    this.errors = [];
    this.forceShutdown = deferred();
    this.hooks = [];
    this.log = log;
    this.running = [];
    this.terminating = false;
    this.timeout = 30000;

    process.on('exit', code => {
      // istanbul ignore next
      this.log.info(`Exiting with status ${code}`);
    });

    this.log.info('Process manager initialized');
  }

  /**
   * Add hook.
   */

  addHook({ type, handler, name = 'a handler' }) {
    this.hooks.push({ handler, name, timeoutError: new Promise.TimeoutError(`${name} took too long to complete ${type} hook`), type });

    this.log.info(`New handler added for hook ${type}`);
  }

  /**
   * Configure `ProcessManager`.
   */

  configure({ timeout } = {}) {
    this.timeout = Number(timeout) || this.timeout;
  }

  /**
   * Exit.
   */

  exit() {
    if (this.errors.length > 0) {
      this.log.error(...this.errors);

      // Output console to error in case no `DEBUG` namespace has been set.
      // This mimicks the default node behaviour of not silencing errors.
      if (!process.env.DEBUG) {
        // eslint-disable-next-line no-console
        console.error(...this.errors);
      }

      return process.exit(1);
    }

    process.exit();
  }

  /**
   * Call all handlers for a hook.
   */

  hook(type, ...args) {
    const hooks = this.hooks.filter(hook => hook.type === type);
    const promises = hooks.map(({ handler }) => reflect(handler, args));

    return Promise.all(promises)
      .timeout(this.timeout, type)
      .catch(Promise.TimeoutError, () => {
        for (let i = 0; i < hooks.length; ++i) {
          if (!promises[i].isPending()) {
            continue;
          }

          this.errors.push(hooks[i].timeoutError);

          this.log.info(`Timeout: ${hooks[i].name} took too long to complete ${type} hook`);
        }
      })
      .then((errors = []) => {
        this.errors.push(...errors.filter(error => !!error));

        return hooks.length;
      });
  }

  /**
   * Setup error and signal handlers to start the shutdown process.
   */

  installHandlers() {
    process.on('unhandledRejection', error => {
      this.log.info('Caught rejection', error);

      this.shutdown({ error });
    });

    process.on('uncaughtException', error => {
      this.log.info('Caught exception', error);

      this.shutdown({ error });
    });

    process.on('SIGINT', () => {
      this.log.info('Caught SIGINT');

      this.shutdown({ force: this.terminating });
    });

    process.on('SIGTERM', () => {
      this.log.info('Caught SIGTERM');

      this.shutdown();
    });
  }

  /**
   * Handle a loop routine.
   */

  loop(fn, { interval = 0 } = {}) {
    return (async () => {
      while (!this.terminating) {
        await this.run(fn, { exit: false });

        if (!this.terminating) {
          await Promise.delay(interval);
        }
      }
    })();
  }

  /**
   * Handle message routine.
   */

  on(fn) {
    return (...args) => this.run(fn, { args, exit: false });
  }

  /**
   * Handle once routine.
   */

  once(fn) {
    return this.run(fn);
  }

  /**
   * Routine handler.
   */

  run(fn, { args = [], exit = true } = {}) {
    if (this.terminating) {
      return;
    }

    const id = Symbol();
    const chain = reflect(fn, args)
      .then(error => {
        this.running = this.running.filter(chain => chain.id !== id);

        if (error || exit) {
          this.shutdown({ error });
        }
      });

    chain.id = id;

    this.running.push(chain);

    return chain;
  }

  /**
   * Shutdown process.
   */

  shutdown({ error, force = false } = {}) {
    if (error) {
      this.errors.push(error);
    }

    if (force) {
      this.forceShutdown.reject();
    }

    if (this.terminating) {
      return;
    }

    this.terminating = true;

    this.log.info('Starting shutdown');

    const gracefulShutdown = Promise.all(this.running)
      .then(() => this.log.info('All running instances have stopped'))
      .then(() => this.hook('drain'))
      .then(hooks => this.log.info(`${hooks} server(s) drained`))
      .then(() => this.hook('disconnect'))
      .then(hooks => this.log.info(`${hooks} service(s) disconnected`))
      .then(() => this.hook('exit', this.errors));

    Promise.race([gracefulShutdown, this.forceShutdown.promise])
      .catch(() => this.log.info('Forced shutdown, skipped waiting'))
      .then(() => this.exit());
  }
}

/**
 * Export `ProcessManager`.
 */

module.exports = ProcessManager;
