/* eslint-disable no-console, unicorn/no-process-exit */

'use strict'

const debug = require('debug')('dependency-check')

const { check } = require('./check')
const { extra, missing } = require('./compare')

const args = require('minimist')(process.argv.slice(2), {
  'default': {
    missing: false,
    unused: false,
    dev: true,
    'default-entries': true,
    verbose: false,
    json: false,
  },
  'boolean': ['missing', 'unused', 'dev', 'version', 'ignore', 'default-entries', 'verbose', 'json'],
  alias: {
    'ignore-module': 'i',
    extensions: 'e',
    json: 'j',
  }
})

if (args['version']) {
  console.log(require('../package.json').version)
  process.exit(1)
}

if (args['help'] || args._.length === 0) {
  console.log('\nUsage: dependency-check <path to entry file, package.json or module folder> <additional entry paths to add> <options>')
  console.log('\nEntry paths supports globbing for easy adding of eg. entire folders.')
  console.log('\nOptions:')
  console.log('--missing             Only check to make sure that all modules in your code are listed in your package.json')
  console.log('--unused              Only check which modules listed in your package.json *are not* used in your code')
  console.log("--no-dev              Won't tell you about devDependencies that are missing or unused")
  console.log("--no-peer             Won't tell you about peerDependencies that are missing or unused")
  console.log("--ignore-module, -i   Won't tell you about these module names when missing or unused. Supports globbing")
  console.log("--no-default-entries  Won't parse your main and bin entries from package.json even when a package.json or module folder has been defined")
  console.log('--detective           Requireable path containing an alternative implementation of the detective module that supports alternate syntaxes')
  console.log("--extensions, -e      List of file extensions with detective to use when resolving require paths. Eg. 'js,jsx:detective-es6'")
  console.log('--version             Show current version')
  console.log('--ignore              To always exit with code 0 pass --ignore')
  console.log('--json -j             Format the output as json object')
  console.log('--verbose             Enable logging of eg. success message')
  console.log('')

  process.exit(1)
}

// windows leaves leading/trailing quotes on strings needed on unix to
// stop shells from doing path expansion, so strip them if present
args._ = args._.map((string) => {
  if (string.startsWith("'") || string.startsWith('"')) {
    string = string.slice(1)
  }

  if (string.endsWith("'") || string.endsWith('"')) {
    string = string.slice(0, -1)
  }

  return string
})

/**
 * @param {string|string[]} arg
 * @returns {import('./extensions').ExtensionsInput}
 */
const extensions = function (arg) {
  if (!arg) return {}

  /** @type {import('./extensions').ExtensionsInput} */
  const extensions = {}

  if (typeof arg === 'string') {
    arg = [arg]
  }

  for (const value of arg) {
    const parts = value.trim().split(':', 2)

    for (const ext of (parts[0] || '').split(',')) {
      extensions[ext.charAt(0) === '.' ? ext : '.' + ext] = parts[1]
    }
  }

  return extensions
}

const path = args._.shift()

if (!path) {
  console.error('Requires a path')
  process.exit(1)
}

check({
  path,
  entries: args._,
  noDefaultEntries: !args['default-entries'],
  extensions: extensions(args['e']),
  detective: args['detective']
})
  .catch(err => {
    console.error('An unexpected error in initial stage:', err.message)
    debug(err.stack)
    process.exit(1)
  })
  .then(data => {
    const pkg = data.package
    const deps = data.used
    /** @type {string[]} */
    const ignore = [args['i'] || []].flat()
    let failed = 0
    const options = {
      excludeDev: args['dev'] === false,
      excludePeer: args['peer'] === false,
      ignore
    }

    const runAllTests = !args['extra'] && !args['missing']

    /** @type {string[]|undefined} */
    let extras
    /** @type {string[]|undefined} */
    let result

    if (runAllTests || args['unused']) {
      extras = extra(pkg, deps, options)
      failed += extras.length
    }
    if (runAllTests || args['missing']) {
      const optionsForMissingCheck = runAllTests
        ? Object.assign({}, options, {
          excludeDev: false,
          excludePeer: false
        })
        : options

      result = missing(pkg, deps, optionsForMissingCheck)

      failed += result.length
    }

    if (args['json']) {
      console.log(JSON.stringify({ missing: result, unused: extras }))
      // eslint-disable-next-line promise/always-return
      process.exit(args['ignore'] || !failed ? 0 : 1)
    }

    if (extras) {
      if (extras.length) {
        console.error('Fail! Modules in package.json not used in code: ' + extras.join(', '))
      } else if (args['verbose']) {
        console.log('Success! All dependencies in package.json are used in the code')
      }
    }
    if (result) {
      if (result.length) {
        console.error('Fail! Dependencies not listed in package.json: ' + result.join(', '))
      } else if (args['verbose']) {
        console.log('Success! All dependencies used in the code are listed in package.json')
      }
    }

    // eslint-disable-next-line promise/always-return
    process.exit(args['ignore'] || !failed ? 0 : 1)
  })
  .catch(err => {
    console.error('An unexpected error happened:', err.message)
    debug(err.stack)
    process.exit(1)
  })
