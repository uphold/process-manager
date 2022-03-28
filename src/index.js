'use strict';

/**
 * Module dependencies.
 */

const log = require('debugnyan')('process-manager');
const utils = require('./utils');

/**
 * Timeout error.
 */

class TimeoutError extends Error {}

/**
 * `ProcessManager`.
 */

class ProcessManager {

  /**
   * Constructor.
   */

  constructor() {
    this.errors = [];
    this.forceShutdown = utils.deferred();
    this.hooks = [];
    this.running = [];
    this.terminating = false;
    this.timeout = 30000;
  }

  /**
   * Add hook.
   */

  addHook({ type, handler, name = 'a handler' }) {
    this.hooks.push({ handler, name, timeoutError: new TimeoutError(`${name} took too long to complete ${type} hook`), type });

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
    const hooks = this.hooks.filter(hook => hook.type === type);

    if (hooks.length === 0) {
      return;
    }

    const promises = hooks.map(({ handler, timeoutError }) => {
      return Promise.race([
        utils.reflect(handler, args),
        utils.timeout(this.timeout, timeoutError)
      ]);
    });

    return Promise.all(promises).then(results => {
      for (const result of results) {
        if (result instanceof TimeoutError) {
          log.info(`Timeout: ${result.message}`);
        } else if (result) {
          this.errors.push(result);
        }
      }
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
          await utils.timeout(interval);
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
    const chain = utils.reflect(fn, args)
      .then(error => {
        this.running.splice(this.running.findIndex(chain => chain.id === id), 1);

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

    log.info('Starting shutdown');

    const gracefulShutdown = Promise.all(this.running)
      .then(() => log.info('All running instances have stopped'))
      .then(() => this.hook('drain'))
      .then(() => log.info(`${this.hooks.filter(hook => hook.type === 'drain').length} server(s) drained`))
      .then(() => this.hook('disconnect'))
      .then(() => log.info(`${this.hooks.filter(hook => hook.type === 'disconnect').length} service(s) disconnected`))
      .then(() => this.hook('exit', this.errors));

    Promise.race([gracefulShutdown, this.forceShutdown.promise])
      .catch(() => log.info('Forced shutdown, skipped waiting'))
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
  log.info(`Exiting with status ${code}`);
});

/**
 * Handle `unhandledRejection`.
 */

process.on('unhandledRejection', error => {
  log.info('Caught rejection', error);

  processManager.shutdown({ error });
});

/**
 * Handle `uncaughtException`.
 */

process.on('uncaughtException', error => {
  log.info('Caught exception', error);

  processManager.shutdown({ error });
});

/**
 * Handle `SIGINT`.
 */

process.on('SIGINT', () => {
  log.info('Caught SIGINT');

  processManager.shutdown({ force: processManager.terminating });
});

/**
 * Handle `SIGTERM`.
 */

process.on('SIGTERM', () => {
  log.info('Caught SIGTERM');

  processManager.shutdown();
});

log.info('Process manager initialized');

/**
 * Export `processManager`.
 */

module.exports = processManager;
