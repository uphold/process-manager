# process-manager

A node.js process manager using [co](https://www.npmjs.com/package/co). This package handles a
process's lifecycle, from running to exiting, by handling errors and exceptions, as well as
graceful shutdowns.

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

```js
const processManager = require('process-manager');

// generator
processManager.once(function *(){
  yield foo.bar();
});

// Promise
processManager.once(() => new Promise((resolve, reject) => {
  foo.bar(err => {
    if (err) return reject();

    return resolve();
  });
}));

// async/await (node v7)
processManager.once(async () => {
  await foo.bar();
});
```

And it will now manage your node process.

### Loop

This lifecycle is used to loop over a given function.

#### Arguments

- `func` _(Function)_: the function to run.
- `[options]` _(object)_: the options object.
- `[options.interval=0]` _(integer)_: how long to wait (in miliseconds) before restarting the function.

#### Example

```js
const processManager = require('process-manager');

processManager.loop(function *() {
  console.log(yield client.getSomeInfo());
}, { interval: 600 });
```

### On

This lifecycle is used to set a function that can be called as much as necessary, it can be called
in an event emmiter. It does not exit unless something goes wrong.

#### Arguments

- `func` _(Function)_: the function to run.

#### Example

```js
const processManager = require('process-manager');

function handler*(value) {
  console.log(yield client.getInfo(value));
}

client.on('event', processManager.on(handler));
```

### Once

This lifecycle is used to a given function and exit.

#### Arguments

- `func` _(Function)_: the function to run.

#### Example

```js
const processManager = require('process-manager');

processManager.once(function *() {
  yield client.doWork();
});
```

### Shutdown

This function can be called to trigger a process shutdown. If passed an error as an optional
argument, it will save it to the errors array. This function will only start the shutdown process
once, any extra calls will be ignored, although it will still save the error if one is passed.

If called with `{ force: true }` it will skip waiting for running processes and immediately start
disconnecting.

#### Arguments

- `[options]` _(object)_: the options object.
- `[options.error]` _(Error)_: an error to add to the errors array.
- `[options.force]` _(Boolean)_: a boolean that forces the shutdown to skip waiting for running processes.

#### Example

```js
const processManager = require('process-manager');

processManager.shutdown({ error: new Error('Error') });
```

## Hooks

Currently there are two hooks that can be used to call external code. These hooks expect a function
that returns a value or a thenable.

If a hook takes longer than 30 seconds to return, it will timeout and continue with the process.

```js
const processManager = require('process-manager');

processManager.addHook('<hook-type>', () => 'result');
processManager.addHook('<hook-type>', () => Promise.resolve('result'));
```

### drain

This hook is called during shutdown, after all running processes have stopped. 
It should be used to drain connections if the process is running a server.

### disconnect

This hook is called after `drain` and it's where
handlers should be added to close running services (ex.: database connections, persistent
connections, etc).

### exit

This hook is called right before the process exits. It passes an array of errors as an argument
to the handler function, and should be used to handle errors before exiting.

## Debug

Enable verbose debugging by setting the DEBUG environment variable to DEBUG=process-manager.

## Release

```shell
❯ npm version [<new version> | major | minor | patch] -m "Release %s"`
```
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
