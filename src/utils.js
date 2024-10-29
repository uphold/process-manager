'use strict';

/**
 * Creates a deferred promise.
 */

module.exports.deferred = function () {
  const deferred = {};

  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });

  return deferred;
};

/**
 * Returns a Console instance as a default logger.
 */

module.exports.getDefaultLogger = function () {
  return console;
};

/**
 * Wraps a function and makes it return the function result on success or an error if it throws.
 */

module.exports.reflect = async function (thenable, args = []) {
  try {
    return await thenable(...args);
  } catch (error) {
    return error;
  }
};

/**
 * Creates promise that will resolve after the given time (in ms).
 */

module.exports.timeout = function (ms, returnValue) {
  return new Promise(resolve => setTimeout(() => resolve(returnValue), ms));
};

/**
 * Validate logger.
 */

module.exports.validateLogger = function (logger) {
  if (typeof logger !== 'object') {
    throw new Error('Logger instance is invalid');
  }

  const requiredLogMethods = ['info', 'warn', 'error'];

  for (const logMethod of requiredLogMethods) {
    if (!logger[logMethod]) {
      throw new Error(`Logger instance is missing required log method '${logMethod}'`);
    }

    if (typeof logger[logMethod] !== 'function') {
      throw new Error(`Logger instance log method '${logMethod}' is not a function`);
    }
  }

  return logger;
};
