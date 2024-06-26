'use strict';

/**
 * Module dependencies.
 */

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
    this.hooks = [];
    this.log = utils.getDefaultLogger();
    this.running = new Set();
    this.startedShutdown = false;
    this.terminating = false;
    this.timeout = 30000;
  }

  /**
   * Add hook.
   */

  addHook({ type, handler, name = 'a handler' }) {
    this.hooks.push({
      handler,
      name,
      timeoutError: new TimeoutError(`${name} took too long to complete ${type} hook`),
      type
    });

    this.log.info(`New handler added for hook ${type}`);
  }

  /**
   * Configure `ProcessManager`.
   */

  configure({ log, timeout } = {}) {
    if (log) {
      this.log = utils.validateLogger(log);
    }

    this.timeout = Number(timeout) || this.timeout;
  }

  /**
   * Exit.
   */

  exit() {
    if (this.errors.length > 0) {
      this.log.error({ errors: this.errors }, 'Exiting with errors');

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
      return Promise.race([utils.reflect(handler, args), utils.timeout(this.timeout, timeoutError)]);
    });

    return Promise.all(promises).then(results => {
      for (const result of results) {
        if (result instanceof TimeoutError) {
          this.log.warn(`Timeout: ${result.message}`);
        } else if (result) {
          this.errors.push(result);
        }
      }
    });
  }

  /**
   * Handle a loop routine.
   */

  async loop(fn, { interval = 0 } = {}) {
    while (!this.terminating) {
      await this.run(fn, { exit: false });

      if (!this.terminating) {
        await utils.timeout(interval);
      }
    }
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
    this.run(fn);
  }

  /**
   * Routine handler.
   */

  async run(fn, { args = [], exit = true } = {}) {
    if (this.terminating) {
      return;
    }

    const id = Symbol();

    this.running.add(id);

    const error = await utils.reflect(fn, args);

    this.running.delete(id);

    if (error || exit || this.terminating) {
      await this.shutdown({ error });
    }
  }

  /**
   * Shutdown process.
   */

  async shutdown({ error, force = false } = {}) {
    if (error) {
      this.errors.push(error);
    }

    if (force) {
      this.log.warn('Forced shutdown, skipped waiting');

      return this.exit();
    }

    this.terminating = true;

    if (this.running.size || this.startedShutdown) {
      return;
    }

    this.startedShutdown = true;

    this.log.info('Starting shutdown');

    await this.hook('drain');

    this.log.info(`${this.hooks.filter(({ type }) => type === 'drain').length} server(s) drained`);

    await this.hook('disconnect');

    this.log.info(`${this.hooks.filter(({ type }) => type === 'disconnect').length} service(s) disconnected`);

    await this.hook('exit', this.errors);

    this.exit();
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
  processManager.log.info(`Exiting with status ${code}`);
});

/**
 * Handle `unhandledRejection`.
 */

process.on('unhandledRejection', error => {
  processManager.log.warn(error, 'Caught rejection');

  processManager.shutdown({ error });
});

/**
 * Handle `uncaughtException`.
 */

process.on('uncaughtException', error => {
  processManager.log.warn(error, 'Caught exception');

  processManager.shutdown({ error });
});

/**
 * Handle `SIGINT`.
 */

process.on('SIGINT', () => {
  processManager.log.warn('Caught SIGINT');

  processManager.shutdown({ force: processManager.terminating });
});

/**
 * Handle `SIGTERM`.
 */

process.on('SIGTERM', () => {
  processManager.log.warn('Caught SIGTERM');

  processManager.shutdown();
});

processManager.log.info('Process manager initialized');

/**
 * Export `processManager`.
 */

module.exports = processManager;
