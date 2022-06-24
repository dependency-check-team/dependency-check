/* eslint-disable no-console, promise/prefer-await-to-then, unicorn/no-process-exit */

'use strict'

// This file purely exists because "import" is a reserved word in old node.js and
// thus can't be included directly in the cli.cjs file without error

import('./cli-engine.js').catch(err => {
  console.error('unexpected error:', err)
  process.exit(1)
})

module.exports = {}
