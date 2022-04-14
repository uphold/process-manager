'use strict';

/**
 * Module Dependencies.
 */

const HealthMonitor = require('../../src/health-monitor');
const log = require('debugnyan')('process-manager:health-monitor');

/**
 * Instances.
 */

const healthMonitor = new HealthMonitor();

/**
 * Test `HealthMonitor`.
 */

describe('HealthMonitor', () => {
  afterEach(() => {
    healthMonitor.cleanup();
  });

  describe('constructor()', () => {
    it('should set up the default values', () => {
      const healthMonitor = new HealthMonitor();

      expect(healthMonitor.checks).toEqual({});
      expect(healthMonitor.globalState).toBe(HealthMonitor.states.UNKNOWN);
      expect(healthMonitor.states).toEqual({});
    });
  });

  describe('addCheck()', () => {
    it('should throw an error if the `id` is already in use', () => {
      healthMonitor.addCheck({ handler: () => {}, id: 'foo' });

      try {
        healthMonitor.addCheck({ handler: () => {}, id: 'foo' });

        fail();
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toBe('Cannot add handler since it would overwrite an existing one');
      }
    });

    it('should add the check and setup the state', () => {
      healthMonitor.addCheck({ handler: () => {}, id: 'foo' });

      expect(Object.keys(healthMonitor.checks)).toHaveLength(1);
      expect(healthMonitor.states.foo).toBe(HealthMonitor.states.UNKNOWN);
    });

    describe('when running the check', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('should call `healthMonitor.updateState()` with `UNHEALTHY` status if the check throws an error', done => {
        const handler = jest.fn(() => {
          throw new Error();
        });

        jest.spyOn(healthMonitor, 'updateState').mockImplementation(({ id, state }) => {
          expect(handler).toHaveBeenCalledTimes(1);
          expect(id).toBe('foo');
          expect(state).toBe(HealthMonitor.states.UNHEALTHY);
          done();
        });

        healthMonitor.addCheck({ handler, id: 'foo' });
        jest.runOnlyPendingTimers();
      });

      it('should call `healthMonitor.updateState()` with `UNHEALTHY` status if the check returns a falsy value', done => {
        const handler = jest.fn(() => {});

        jest.spyOn(healthMonitor, 'updateState').mockImplementation(({ id, state }) => {
          expect(handler).toHaveBeenCalledTimes(1);
          expect(id).toBe('foo');
          expect(state).toBe(HealthMonitor.states.UNHEALTHY);
          done();
        });

        healthMonitor.addCheck({ handler, id: 'foo' });
        jest.runOnlyPendingTimers();
      });

      it('should call `healthMonitor.updateState()` with `UNHEALTHY` status if the check does not complete after 5 seconds', done => {
        const handler = jest.fn(() => new Promise(() => {}));

        jest.spyOn(healthMonitor, 'updateState').mockImplementation(({ id, state }) => {
          expect(handler).toHaveBeenCalledTimes(1);
          expect(id).toBe('foo');
          expect(state).toBe(HealthMonitor.states.UNHEALTHY);
          done();
        });

        healthMonitor.addCheck({ handler, id: 'foo' });
        jest.advanceTimersByTime(5000);
      });

      it('should call `healthMonitor.updateState()` with `HEALTHY` status if the check returns a truthy value', done => {
        const handler = jest.fn(() => true);

        jest.spyOn(healthMonitor, 'updateState').mockImplementation(({ id, state }) => {
          expect(handler).toHaveBeenCalledTimes(1);
          expect(id).toBe('foo');
          expect(state).toBe(HealthMonitor.states.HEALTHY);
          done();
        });

        healthMonitor.addCheck({ handler, id: 'foo' });
        jest.runOnlyPendingTimers();
      });

      it('should call handle asynchronous checks', done => {
        const handler = jest.fn(() => Promise.resolve(true));

        jest.spyOn(healthMonitor, 'updateState').mockImplementation(({ id, state }) => {
          expect(handler).toHaveBeenCalledTimes(1);
          expect(id).toBe('foo');
          expect(state).toBe(HealthMonitor.states.HEALTHY);
          done();
        });

        healthMonitor.addCheck({ handler, id: 'foo' });
        jest.runOnlyPendingTimers();
      });
    });
  });

  describe('cleanup()', () => {
    it('should clear all checks and states currently running', () => {
      healthMonitor.checks.foo = setTimeout(() => {}, 5000);
      healthMonitor.states.foo = HealthMonitor.states.HEALTHY;
      healthMonitor.globalState = HealthMonitor.states.HEALTHY;

      healthMonitor.cleanup();

      expect(healthMonitor.checks).toEqual({});
      expect(healthMonitor.states).toEqual({});
      expect(healthMonitor.globalState).toBe(HealthMonitor.states.UNKNOWN);
    });
  });

  describe('updateState()', () => {
    it('should not update the component state if it has not changed', () => {
      healthMonitor.states.foo = HealthMonitor.states.HEALTHY;

      jest.spyOn(log, 'info');

      healthMonitor.updateState({ id: 'foo', state: HealthMonitor.states.HEALTHY });

      expect(log.info).not.toHaveBeenCalled();

      expect(healthMonitor.states.foo).toBe(HealthMonitor.states.HEALTHY);
    });

    it('should update the component state if it has changed', () => {
      healthMonitor.states.foo = HealthMonitor.states.HEALTHY;
      healthMonitor.globalState = HealthMonitor.states.UNHEALTHY;

      jest.spyOn(log, 'info');

      healthMonitor.updateState({ id: 'foo', state: HealthMonitor.states.UNHEALTHY });

      expect(log.info).toHaveBeenCalledTimes(1);
      expect(log.info).toHaveBeenCalledWith(
        {
          id: 'foo',
          newState: HealthMonitor.states.UNHEALTHY,
          oldState: HealthMonitor.states.HEALTHY
        },
        'Component health status has changed'
      );

      expect(healthMonitor.states.foo).toBe(HealthMonitor.states.UNHEALTHY);
    });

    it('should not update the global state if it has not changed', () => {
      healthMonitor.states.foo = HealthMonitor.states.UNHEALTHY;
      healthMonitor.globalState = HealthMonitor.states.HEALTHY;

      jest.spyOn(log, 'info');

      healthMonitor.updateState({ id: 'foo', state: HealthMonitor.states.HEALTHY });

      expect(log.info).toHaveBeenCalledTimes(1);

      expect(healthMonitor.states.foo).toBe(HealthMonitor.states.HEALTHY);
      expect(healthMonitor.globalState).toBe(HealthMonitor.states.HEALTHY);
    });

    it('should update the global state if it has changed', () => {
      healthMonitor.states.foo = HealthMonitor.states.HEALTHY;
      healthMonitor.globalState = HealthMonitor.states.HEALTHY;

      jest.spyOn(log, 'info');

      healthMonitor.updateState({ id: 'foo', state: HealthMonitor.states.UNHEALTHY });

      expect(log.info).toHaveBeenCalledTimes(2);
      expect(log.info).toHaveBeenLastCalledWith(
        {
          newState: HealthMonitor.states.UNHEALTHY,
          oldState: HealthMonitor.states.HEALTHY
        },
        'Global health status has changed'
      );

      expect(healthMonitor.states.foo).toBe(HealthMonitor.states.UNHEALTHY);
      expect(healthMonitor.globalState).toBe(HealthMonitor.states.UNHEALTHY);
    });

    describe('global state', () => {
      it('should be UNKNOWN if at least one of the components is in the UNKNOWN state', () => {
        healthMonitor.updateState({ id: 'foo', state: HealthMonitor.states.HEALTHY });
        healthMonitor.updateState({ id: 'bar', state: HealthMonitor.states.UNHEALTHY });
        healthMonitor.updateState({ id: 'biz', state: HealthMonitor.states.UNKNOWN });

        expect(healthMonitor.globalState).toBe(HealthMonitor.states.UNKNOWN);
        expect(healthMonitor.states).toEqual({
          bar: HealthMonitor.states.UNHEALTHY,
          biz: HealthMonitor.states.UNKNOWN,
          foo: HealthMonitor.states.HEALTHY
        });
      });

      it('should be UNHEALTHY if no component is in the UNKNOWN state and at least one of the components is in the UNHEALTHY state', () => {
        healthMonitor.updateState({ id: 'foo', state: HealthMonitor.states.HEALTHY });
        healthMonitor.updateState({ id: 'bar', state: HealthMonitor.states.UNHEALTHY });
        healthMonitor.updateState({ id: 'biz', state: HealthMonitor.states.HEALTHY });

        expect(healthMonitor.globalState).toBe(HealthMonitor.states.UNHEALTHY);
        expect(healthMonitor.states).toEqual({
          bar: HealthMonitor.states.UNHEALTHY,
          biz: HealthMonitor.states.HEALTHY,
          foo: HealthMonitor.states.HEALTHY
        });
      });

      it('should be HEALTHY if all components are in the HEALTHY state', () => {
        healthMonitor.updateState({ id: 'foo', state: HealthMonitor.states.HEALTHY });
        healthMonitor.updateState({ id: 'bar', state: HealthMonitor.states.HEALTHY });
        healthMonitor.updateState({ id: 'biz', state: HealthMonitor.states.HEALTHY });

        expect(healthMonitor.globalState).toBe(HealthMonitor.states.HEALTHY);
        expect(healthMonitor.states).toEqual({
          bar: HealthMonitor.states.HEALTHY,
          biz: HealthMonitor.states.HEALTHY,
          foo: HealthMonitor.states.HEALTHY
        });
      });
    });
  });
});
