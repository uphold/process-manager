'use strict';

/**
 * Module dependencies.
 */

const _ = require('lodash');
const Promise = require('bluebird');
const co = require('co');
const log = require('debugnyan')('process-manager');

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
    .then(_.noop, _.identity);
}

/**
 * `ProcessManager`.
 */

class ProcessManager {

  /**
   * Constructor.
   */

  constructor() {
    this.errors = [];
    this.forceShutdown = deferred();
    this.hooks = [];
    this.running = [];
    this.terminating = false;
    this.timeout = 30000;
  }

  /**
   * Add hook.
   */

  addHook({ type, handler, name = 'a handler' }) {
    this.hooks.push({ handler, name, timeoutError: new Promise.TimeoutError(`${name} took too long to complete ${type} hook`), type });

    log.info(`New handler added for hook ${type}`);
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
      log.error(...this.errors);

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
    const hooks = _.filter(this.hooks, { type });
    const promises = _.map(hooks, ({ handler }) => reflect(handler, args));

    return Promise.all(promises)
      .timeout(this.timeout, type)
      .catch(Promise.TimeoutError, () => {
        for (let i = 0; i < hooks.length; ++i) {
          if (!promises[i].isPending()) {
            continue;
          }

          this.errors.push(hooks[i].timeoutError);

          log.info(`Timeout: ${hooks[i].name} took too long to complete ${type} hook`);
        }
      })
      .then(errors => this.errors.push(..._.compact(errors)));
  }

  /**
   * Handle a loop routine.
   */

  loop(func, { interval = 0 } = {}) {
    const self = this;

    return this.run(function *() {
      while (!self.terminating) {
        yield func();

        if (!self.terminating) {
          yield Promise.delay(interval);
        }
      }
    });
  }

  /**
   * Handle message routine.
   */

  on(func) {
    return (...args) => this.run(func, { args, exit: false });
  }

  /**
   * Handle once routine.
   */

  once(func) {
    return this.run(func);
  }

  /**
   * Routine handler.
   */

  run(func, { args = [], exit = true } = {}) {
    if (this.terminating) {
      return;
    }

    const id = Symbol();
    const chain = reflect(co.wrap(func), args)
      .then(error => {
        _.remove(this.running, { id });

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

    log.info('Starting shutdown.');

    const gracefulShutdown = Promise.all(this.running)
      .then(() => log.info('All running instances have stopped.'))
      .then(() => this.hook('drain'))
      .then(() => log.info(`${_.filter(this.hooks, { type: 'drain' }).length} server(s) drained.`))
      .then(() => this.hook('disconnect'))
      .then(() => log.info(`${_.filter(this.hooks, { type: 'disconnect' }).length} service(s) disconnected.`))
      .then(() => this.hook('exit', this.errors));

    Promise.race([gracefulShutdown, this.forceShutdown.promise])
      .catch(() => log.info('Forced shutdown, skipped waiting.'))
      .then(() => this.exit());
  }
}

/**
 * Create `ProcessManager` singleton.
 */

const processManager = new ProcessManager();

/**
 * Handle `exit`.
 */

// istanbul ignore next
process.on('exit', code => {
  log.info(`Exiting with status ${code}.`);
});

/**
 * Handle `unhandledRejection`.
 */

process.on('unhandledRejection', error => {
  log.info('Caught rejection.', error);

  processManager.shutdown({ error });
});

/**
 * Handle `uncaughtException`.
 */

process.on('uncaughtException', error => {
  log.info('Caught exception.', error);

  processManager.shutdown({ error, force: true });
});

/**
 * Handle `SIGINT`.
 */

process.on('SIGINT', () => {
  log.info('Caught SIGINT.');

  processManager.shutdown({ force: processManager.terminating });
});

/**
 * Handle `SIGTERM`.
 */

process.on('SIGTERM', () => {
  log.info('Caught SIGTERM.');

  processManager.shutdown();
});

log.info('Process manager initialized.');

/**
 * Export `processManager`.
 */

module.exports = processManager;
