/* eslint-disable no-console, unicorn/no-process-exit */

import meow from 'meow'

import { check } from './check.js'
import { findMissing, findUnused } from './compare.js'

const cli = meow(`
  Usage
    $ dependency-check <path to entry file, package.json or module folder> <additional entry paths to add> <options>

  Entry paths supports globbing for easy adding of eg. entire folders.

  Options
    --detective                    Requireable path containing an alternative implementation of the detective module that supports alternate syntaxes
    --extensions, -e               List of file extensions with detective to use when resolving require paths. Eg. 'js,jsx:detective-es6'
    --help                         Print this help and exits.
    --ignore                       To always exit with code 0 pass --ignore
    --ignore-module, -i            Won't tell you about these module names when missing or unused. Supports globbing
    --ignore-unknown-extension, -u Won't fail on file extensions that are missing detectives
    --json, -j                     Format the output as json object
    --missing                      Only check to make sure that all modules in your code are listed in your package.json
    --no-default-entries           Won't parse your main and bin entries from package.json even when a package.json or module folder has been defined
    --no-dev                       Won't tell you about devDependencies that are missing or unused
    --no-peer                      Won't tell you about peerDependencies that are missing or unused
    --unused                       Only check which modules listed in your package.json *are not* used in your code
    --verbose                      Enable logging of eg. success message
    --version                      Prints current version and exits.

  Examples
    $ dependency-check .
`, {
  flags: {
    defaultEntries: { type: 'boolean', 'default': true },
    detective: { type: 'string' },
    dev: { type: 'boolean', 'default': true },
    extensions: { alias: 'e', type: 'string', isMultiple: true },
    ignore: { type: 'boolean' },
    ignoreModule: { alias: 'i', type: 'string', isMultiple: true },
    ignoreUnknownExtensions: { alias: 'u', type: 'boolean', 'default': false },
    json: { alias: 'j', type: 'boolean', 'default': false },
    missing: { type: 'boolean', 'default': false },
    peer: { type: 'boolean', 'default': true },
    unused: { type: 'boolean', 'default': false },
    verbose: { type: 'boolean', 'default': false },
  },
  importMeta: import.meta
})

// windows leaves leading/trailing quotes on strings needed on unix to
// stop shells from doing path expansion, so strip them if present
const entries = cli.input.map((string) => {
  if (string.startsWith("'") || string.startsWith('"')) {
    string = string.slice(1)
  }

  if (string.endsWith("'") || string.endsWith('"')) {
    string = string.slice(0, -1)
  }

  return string
})

/**
 * @param {string|string[]|undefined} arg
 * @returns {import('./extensions').ExtensionsInput}
 */
function resolveExtensionsArgument (arg) {
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

const path = entries.shift()

if (!path) {
  console.error('Requires a path')
  process.exit(1)
}

const {
  defaultEntries: addDefaultEntries,
  detective,
  dev: includeDev,
  extensions,
  ignore,
  ignoreModule = [],
  ignoreUnknownExtensions,
  json,
  missing,
  peer: includePeer,
  unused,
  verbose,
} = cli.flags

const {
  'package': pkg,
  used: deps,
} = await check({
  path,
  entries,
  ignoreUnknownExtensions,
  noDefaultEntries: !addDefaultEntries,
  extensions: resolveExtensionsArgument(extensions),
  detective,
})

const options = {
  excludeDev: !includeDev,
  excludePeer: !includePeer,
  ignore: ignoreModule,
}

const runAllTests = !unused && !missing

let failed = 0
/** @type {string[]|undefined} */
let unusedDependencies
/** @type {string[]|undefined} */
let missingDependencies

if (runAllTests || unused) {
  unusedDependencies = findUnused(pkg, deps, options)
  failed += unusedDependencies.length
}

if (runAllTests || missing) {
  const optionsForMissingCheck = runAllTests
    ? {
        ...options,
        excludeDev: false,
        excludePeer: false
      }
    : options

  missingDependencies = findMissing(pkg, deps, optionsForMissingCheck)

  failed += missingDependencies.length
}

// print the result

if (json) {
  console.log(JSON.stringify({
    missing: missingDependencies,
    unused: unusedDependencies
  }))
} else {
  if (unusedDependencies) {
    if (unusedDependencies.length) {
      console.error('Fail! Modules in package.json not used in code: ' + unusedDependencies.join(', '))
    } else if (verbose) {
      console.log('Success! All dependencies in package.json are used in the code')
    }
  }

  if (missingDependencies) {
    if (missingDependencies.length) {
      console.error('Fail! Dependencies not listed in package.json: ' + missingDependencies.join(', '))
    } else if (verbose) {
      console.log('Success! All dependencies used in the code are listed in package.json')
    }
  }
}

process.exit((failed && !ignore) ? 1 : 0)
