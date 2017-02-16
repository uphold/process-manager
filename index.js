
/**
 * Module dependencies.
 */

const _ = require('lodash');
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
  return new Promise(resolve => resolve(thenable(...args)))
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
    this.hooks = {};
    this.running = [];
    this.terminating = false;
    this.timeout = 30000;
  }

  /**
   * Add hook.
   */

  addHook(name, handler) {
    (this.hooks[name] = _.get(this.hooks, name, [])).push(handler);

    log.info(`New handler added for hook ${name}`);
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

  hook(name, ...args) {
    return Promise.race([
      Promise.all(_.map(this.hooks[name] || [], handler => reflect(handler, args))),
      new Promise(resolve => {
        setTimeout(resolve, this.timeout, new Error(`Timeout: hook '${name}' took too long to run.`));
      })
    ]);
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
          yield new Promise(resolve => setTimeout(resolve, interval));
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
        const idx = this.running.findIndex(it => it.id === id);

        /* istanbul ignore else */
        if (idx !== -1) {
          this.running.splice(idx, 1);
        }

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

    if (this.terminating && force) {
      this.forceShutdown.reject();
    }

    if (this.terminating) {
      return;
    }

    this.terminating = true;
    this.forceShutdown = deferred();

    log.info('Starting shutdown.');

    Promise.race([Promise.all(this.running), this.forceShutdown.promise])
      .then(() => log.info('All running instances have stopped.'))
      .catch(() => log.info('Forced shutdown, skipped waiting for instances.'))
      .then(() => this.hook('disconnect'))
      .then(errors => {
        this.errors = _.compact(_.concat(this.errors, errors));

        log.info(`${(this.hooks.disconnect || []).length} service(s) disconnected.`);
      })
      .then(() => this.hook('exit', this.errors))
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

  processManager.shutdown({ error });
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
