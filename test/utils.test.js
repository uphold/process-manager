'use strict';

/**
 * Module dependencies.
 */

const { Console } = require('node:console');
const { describe, test } = require('node:test');
const assert = require('node:assert');
const utils = require('../src/utils');

/**
 * Test `Utils`.
 */

describe('Utils', () => {
  describe('deferred()', () => {
    test('returns a deferred Promise', () => {
      const deferred = utils.deferred();

      assert.strictEqual(deferred.promise instanceof Promise, true);
      assert.strictEqual(typeof deferred.resolve, 'function');
      assert.strictEqual(typeof deferred.reject, 'function');
    });
  });

  describe('getDefaultLogger()', () => {
    test('returns an instance of Console', () => {
      const log = utils.getDefaultLogger();

      assert.strictEqual(log instanceof Console, true);
    });
  });

  describe('reflect()', () => {
    test('returns the result of the the passed function', async () => {
      assert.strictEqual(await utils.reflect(() => {}), undefined);
      assert.strictEqual(await utils.reflect(() => 'foo'), 'foo');
      assert.strictEqual(await utils.reflect(() => Promise.resolve('foo')), 'foo');
      assert.deepStrictEqual(await utils.reflect(() => Promise.resolve({ foo: 1 })), { foo: 1 });
    });

    test('returns an error if the passed function throws an error', async () => {
      const result1 = await utils.reflect(() => {
        throw new Error('foo');
      });

      assert.strictEqual(result1 instanceof Error, true);

      const result2 = await utils.reflect(() => Promise.reject(new Error('foo')));

      assert.strictEqual(result2 instanceof Error, true);
    });
  });

  describe('timeout()', () => {
    test('returns the given value after the defined time has passed', async () => {
      const result = await utils.timeout(1, 'foo');

      assert.strictEqual(result, 'foo');
    });
  });

  describe('validateLogger()', () => {
    test('throws an error if the logger is not an object', () => {
      assert.throws(() => utils.validateLogger('foo'), new Error('Logger instance is invalid'));
    });

    ['info', 'warn', 'error'].forEach(logMethod => {
      test(`throws an error if the logger is missing log method ${logMethod}`, () => {
        const logger = { error: () => {}, info: () => {}, warn: () => {} };

        delete logger[logMethod];

        assert.throws(
          () => utils.validateLogger(logger),
          new Error(`Logger instance is missing required log method '${logMethod}'`)
        );
      });

      test(`throws an error if the log method ${logMethod} is not a function`, () => {
        const logger = { error: () => {}, info: () => {}, warn: () => {} };

        logger[logMethod] = 'foo';

        assert.throws(
          () => utils.validateLogger(logger),
          new Error(`Logger instance log method '${logMethod}' is not a function`)
        );
      });
    });

    test(`returns the logger instance if it is valid`, () => {
      const logger = { error: () => {}, info: () => {}, warn: () => {} };

      assert.strictEqual(utils.validateLogger(logger), logger);
    });
  });
});
