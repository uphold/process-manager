# process-manager

A node.js process manager. This package handles a process's lifecycle, from running to exiting, by handling errors and exceptions, as well as graceful shutdowns.

## Status

[![npm version][npm-image]][npm-url] [![build status][travis-image]][travis-url]

## Installation

Install the package via **yarn**:

```shell
❯ yarn add '@uphold/process-manager'
```

Or **npm**:

```shell
❯ npm install '@uphold/process-manager' --save
```

## Usage

To use `process-manager` simply require it in your project.

```javascript
const processManager = require('process-manager');

// async/await
processManager.once(async () => {
  await foo.bar();
});

// Promise
processManager.once(() => new Promise((resolve, reject) => {
  foo.bar(err => {
    if (err) return reject();

    return resolve();
  });
}));

```

And it will now manage your node process.

### loop(fn, [options])

This lifecycle is used to loop over a given function.

#### Arguments

- `fn` _(Function)_: the function to run.
- `[options]` _(object)_: the options object.
- `[options.interval=0]` _(integer)_: how long to wait (in miliseconds) before restarting the function.

#### Example

```javascript
const processManager = require('process-manager');

processManager.loop(async () => {
  console.log(await client.getSomeInfo());
}, { interval: 600 });
```

### on(fn)

This lifecycle is used to get a function suited for using with an event emitter. It does not exit unless something goes wrong.

#### Arguments

- `fn` _(Function)_: the function to run.

#### Example

```javascript
const processManager = require('process-manager');

async function handler(value) {
  console.log(await client.getInfo(value));
}

client.on('event', processManager.on(handler));
```

### once(fn)

This lifecycle is used to a given function and exit.

#### Arguments

- `fn` _(Function)_: the function to run.

#### Example

```javascript
const processManager = require('process-manager');

processManager.once(async () => {
  await client.doWork();
});
```

### shutdown([args])

This function can be called to trigger a process shutdown. If passed an error as an optional argument, it will save it to the errors array. This function will only start the shutdown process once, any extra calls will be ignored, although it will still save the error if one is passed.

If called with `{ force: true }` it will skip waiting for running processes and immediately start disconnecting.

#### Arguments

- `[args]` _(object)_: the arguments object.
- `[args.error]` _(Error)_: an error to add to the errors array.
- `[args.force]` _(Boolean)_: a boolean that forces the shutdown to skip waiting for running processes.

#### Example

```javascript
const processManager = require('process-manager');

processManager.shutdown({ error: new Error('Error') });
```

## Hooks

Currently there are three hooks that can be used to call external code during the shutdown process. If a hook takes longer than 30 seconds to return, it will timeout and continue with the shutdown process.

### drain

This hook is called during shutdown, after all running processes have stopped. It should be used to drain connections if the process is running a server.

### disconnect

This hook is called after `drain` and it's where handlers should be added to close running services (ex.: database connections, persistent connections, etc).

### exit

This hook is called right before the process exits. It passes an array of errors as an argument to the handler function, and should be used to handle errors before exiting.

### addHook({ handler, type, [name='a handler'] })

This function is used to add a hook for one of the types described above.

#### Arguments

- `args.handler` _(Function)_: a function that returns a value or a thenable.
- `args.type` _(string)_: the hook type.
- `[args.name='a handler']` _(string)_: identifies the hook.

```javascript
const processManager = require('process-manager');

processManager.addHook({ handler: () => 'result', type: <hook-type> });
processManager.addHook({ handler: () => Promise.resolve('result'), type: <hook-type> });
```

## Integrations

### [sentry.io](https://sentry.io)

The recommended way to report errors to sentry is by adding an `exit` hook and sending each error using a promisified `captureException`.

```javascript
const Promise = require('bluebird');
const raven = Promise.promisifyAll(require('raven'));

raven.config('https://******@sentry.io/<appId>').install();

processManager.addHook({
  handler: errors => Promise.map(errors, error => raven.captureExceptionAsync(error)),
  name: 'sentry',
  type: 'exit'
});
```

## Debug

Enable verbose debugging by configuring your own logger and passing it to `proccessManager.configure({ log: myCustomLogger })`.

The minimum requirements for it to work is that the logger must be Object-like and have functions assigned to properties `info`, `warn`, and `error`.
The functions should be able to handle two different argument signatures:
- log.<level>(message)
- log.<level>(fields, message)

Most javascript loggers should use this format (this one was derived from [bunyan](https://www.npmjs.com/package/bunyan))

## Release

The release of a version is automated via the [release](https://github.com/uphold/process-manager/actions/workflows/release.yaml) GitHub workflow. Run it by clicking the "Run workflow" button.

## Test

To test using a local version of `node`, run:

```sh
❯ yarn test
```

## License

MIT

[npm-image]: https://img.shields.io/npm/v/@uphold/process-manager.svg?style=flat-square
[npm-url]: https://npmjs.org/package/@uphold/process-manager
[travis-image]: https://img.shields.io/travis/uphold/process-manager.svg?style=flat-square
[travis-url]: https://travis-ci.org/uphold/process-manager
