#!/usr/bin/env node
/* eslint-disable no-var, no-console, unicorn/prefer-number-properties */

'use strict'

if (require('./package.json').engines.node !== '^12.20.0 || ^14.13.1 || >=16.0.0') {
  console.error('dependency-check: Mismatch between package.json node engine and cli engine check')
  process.exit(1)
}

var match = process.version.match(/v(\d+)\.(\d+)/) || []
var major = parseInt(match[1] || '', 10)
var minor = parseInt(match[2] || '', 10)

if (major >= 12 || (major === 12 && minor >= 20)) {
  require('./lib/cli-engine')
} else {
  console.error('dependency-check: Node 12.20.0 or greater is required. `dependency-check` did not run.')
  process.exit(0)
}
