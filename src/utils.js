'use strict';

/**
 * Creates a deferred promise.
 */

module.exports.deferred = function() {
  const deferred = {};

  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });

  return deferred;
};

/**
 * Creates promise that will resolve after the given time (in ms).
 */

module.exports.timeout = function(ms, returnValue) {
  return new Promise(resolve => setTimeout(() => resolve(returnValue), ms));
};

/**
 * Wraps a function and makes it return undefined on success or an error if it throws.
 */

module.exports.reflect = async function(thenable, args) {
  try {
    await thenable(...args);
  } catch (error) {
    return error;
  }
};
