'use strict';

/**
 * Module dependencies.
 */

const log = require('debugnyan')('process-manager:health-monitor');
const utils = require('./utils');

/**
 * `HealthMonitor`.
 */

class HealthMonitor {
  /**
   * Constructor.
   */

  constructor() {
    this.checks = {};
    this.globalState = HealthMonitor.states.UNKNOWN;
    this.states = {};
  }

  /**
   * Add health check.
   */

  addCheck({ handler, id, interval = 5000 }) {
    if (this.states[id]) {
      throw new Error('Cannot add handler since it would overwrite an existing one');
    }

    this.states[id] = HealthMonitor.states.UNKNOWN;

    const check = async () => {
      let state;

      try {
        state = (await Promise.race([handler(), utils.timeout(5000, false)]))
          ? HealthMonitor.states.HEALTHY
          : HealthMonitor.states.UNHEALTHY;
      } catch (e) {
        state = HealthMonitor.states.UNHEALTHY;
      }

      this.updateState({ id, state });

      this.checks[id] = setTimeout(check, interval);
    };

    this.checks[id] = setTimeout(check, 0);

    log.info(`New health monitor check added with id '${id}'`);
  }

  /**
   * Cleanup health monitor by clearing all timers and resetting the internal state.
   */

  cleanup() {
    Object.values(this.checks).forEach(clearTimeout);

    this.checks = {};
    this.globalState = HealthMonitor.states.UNKNOWN;
    this.states = {};
  }

  /**
   * Handles state changes.
   */

  updateState({ id, state }) {
    if (this.states[id] === state) {
      return;
    }

    log.info({ id, newState: state, oldState: this.states[id] }, 'Component health status has changed');

    this.states[id] = state;

    // The sorted states array makes it so that the state at the end of the array is the relevant one.
    // The global state is:
    // - UNKNOWN if one exists.
    // - UNHEALTHY if one exists and there are no UNKNOWN states.
    // - HEALTHY if there are no UNKNOWN and UNHEALTHY states.
    const [globalState] = Object.values(this.states).sort((left, right) => {
      return left < right ? 1 : -1;
    });

    if (this.globalState === globalState) {
      return;
    }

    log.info({ newState: globalState, oldState: this.globalState }, 'Global health status has changed');

    this.globalState = globalState;
  }
}

/**
 * Health states.
 */

HealthMonitor.states = {
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown'
};

/**
 * Export `HealthMonitor` class.
 */

module.exports = HealthMonitor;
