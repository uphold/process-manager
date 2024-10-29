'use strict';

/**
 * Module dependencies.
 */

const { Console } = require('node:console');
const utils = require('../src/utils');

/**
 * Test `Utils`.
 */

describe('Utils', () => {
  describe('deferred()', () => {
    test('returns a deferred Promise', () => {
      const deferred = utils.deferred();

      expect(deferred.promise).toBeInstanceOf(Promise);
      expect(deferred.resolve).toBeInstanceOf(Function);
      expect(deferred.reject).toBeInstanceOf(Function);
    });
  });

  describe('getDefaultLogger()', () => {
    test('returns an instance of Console', () => {
      const log = utils.getDefaultLogger();

      expect(log).toBeInstanceOf(Console);
    });
  });

  describe('reflect()', () => {
    test('returns the result of the the passed function', async () => {
      await expect(utils.reflect(() => {})).resolves.toBeUndefined();
      await expect(utils.reflect(() => 'foo')).resolves.toBe('foo');
      await expect(utils.reflect(() => Promise.resolve('foo'))).resolves.toBe('foo');
      await expect(utils.reflect(() => Promise.resolve({ foo: 1 }))).resolves.toEqual({ foo: 1 });
    });

    test('returns an error if the passed function throws an error', async () => {
      await expect(
        utils.reflect(() => {
          throw new Error('foo');
        })
      ).resolves.toBeInstanceOf(Error);
      await expect(utils.reflect(() => Promise.reject(new Error('foo')))).resolves.toBeInstanceOf(Error);
    });
  });

  describe('timeout()', () => {
    test('returns the given value after the defined time has passed', async () => {
      jest.useFakeTimers();

      const timeout = utils.timeout(1000, 'foo');
      const before = jest.now();

      jest.runAllTimers();

      await expect(timeout).resolves.toBe('foo');
      expect(jest.now() - before).toBe(1000);
    });
  });

  describe('validateLogger()', () => {
    test('throws an error if the logger is not an object', () => {
      expect(() => utils.validateLogger('foo')).toThrow('Logger instance is invalid');
    });

    ['info', 'warn', 'error'].forEach(logMethod => {
      test(`throws an error if the logger is missing log method ${logMethod}`, () => {
        const logger = { error: () => {}, info: () => {}, warn: () => {} };

        delete logger[logMethod];

        expect(() => utils.validateLogger(logger)).toThrow(
          `Logger instance is missing required log method '${logMethod}'`
        );
      });

      test(`throws an error if the log method ${logMethod} is not a function`, () => {
        const logger = { error: () => {}, info: () => {}, warn: () => {} };

        logger[logMethod] = 'foo';

        expect(() => utils.validateLogger(logger)).toThrow(
          `Logger instance log method '${logMethod}' is not a function`
        );
      });
    });

    test(`returns the logger instance if it is valid`, () => {
      const logger = { error: () => {}, info: () => {}, warn: () => {} };

      expect(utils.validateLogger(logger)).toBe(logger);
    });
  });
});
