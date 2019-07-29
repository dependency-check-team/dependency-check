#!/usr/bin/env node

'use strict'

const requiredNodeEngineMinimum = parseInt(require('./package.json').engines.node.match(/^>=(\d+)\./)[1], 10)
const currentNodeEngine = parseInt(process.version.match(/^v(\d+)\./)[1], 10)

if (currentNodeEngine < requiredNodeEngineMinimum) {
  console.error('dependency-check: Node ' + requiredNodeEngineMinimum + ' or greater is required. `dependency-check` did not run.')
  process.exit(0)
}

const check = require('./')

const args = require('minimist')(process.argv.slice(2), {
  default: {
    missing: false,
    unused: false,
    dev: true,
    'default-entries': true,
    verbose: false
  },
  boolean: ['missing', 'unused', 'dev', 'version', 'ignore', 'default-entries', 'verbose'],
  alias: {
    'ignore-module': 'i',
    extensions: 'e'
  }
})

if (args.version) {
  console.log(require('./package.json').version)
  process.exit(1)
}

if (args.help || args._.length === 0) {
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
  console.log('--verbose             Enable logging of eg. success message')
  console.log('')

  process.exit(1)
}

function extensions (arg) {
  if (!arg) return undefined
  const extensions = {}

  function add (value) {
    const parts = value.trim().split(':', 2)

    parts[0].split(',').forEach(function (ext) {
      extensions[ext.charAt(0) === '.' ? ext : '.' + ext] = parts[1]
    })
  }

  if (typeof arg === 'string') {
    add(arg)
  } else {
    arg.forEach(add)
  }

  return extensions
}

check({
  path: args._.shift(),
  entries: args._,
  noDefaultEntries: !args['default-entries'],
  extensions: extensions(args.e),
  detective: args.detective
})
  .then(data => {
    const pkg = data.package
    const deps = data.used
    let failed = 0
    const options = {
      excludeDev: args.dev === false,
      excludePeer: args.peer === false,
      ignore: [].concat(args.i || [])
    }

    const runAllTests = !args.extra && !args.missing

    if (runAllTests || args.unused) {
      const extras = check.extra(pkg, deps, options)
      failed += extras.length
      if (extras.length) {
        console.error('Fail! Modules in package.json not used in code: ' + extras.join(', '))
      } else if (args.verbose) {
        console.log('Success! All dependencies in package.json are used in the code')
      }
    }
    if (runAllTests || args.missing) {
      const optionsForMissingCheck = runAllTests
        ? Object.assign({}, options, {
          excludeDev: false,
          excludePeer: false
        })
        : options

      const missing = check.missing(pkg, deps, optionsForMissingCheck)

      failed += missing.length

      if (missing.length) {
        console.error('Fail! Dependencies not listed in package.json: ' + missing.join(', '))
      } else if (args.verbose) {
        console.log('Success! All dependencies used in the code are listed in package.json')
      }
    }
    process.exit(args.ignore || !failed ? 0 : 1)
  })
  .catch(err => {
    console.error(err.message)
    process.exit(1)
  })
