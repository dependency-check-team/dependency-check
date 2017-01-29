#!/usr/bin/env node

var check = require('./')

var args = require('minimist')(process.argv.slice(2), {
  default: {
    missing: false,
    extra: false,
    dev: true,
    'default-entries': true
  },
  boolean: ['missing', 'extra', 'dev', 'version', 'ignore', 'default-entries'],
  alias: {
    extra: 'unused',
    'ignore-module': 'i',
    'extensions': 'e'
  }
})

if (args.version) {
  console.log(require('./package.json').version)
  process.exit(1)
}

if (args.help || args._.length === 0) {
  console.log('\nUsage: dependency-check <path to package.json or module folder> <additional entries to add> <options>')

  console.log('\nOptions:')
  console.log('--missing (default)   Check to make sure that all modules in your code are listed in your package.json')
  console.log('--unused, --extra     The inverse of the --missing check and will tell you which modules in your package.json *were not* used in your code')
  console.log("--no-dev              Won't tell you about which devDependencies in your package.json dependencies that were not used in your code. Only usable with --unused")
  console.log("--ignore-module, -i   Won't tell you about module names passed in as --ignore-module / -i. Only usable with --unused")
  console.log('--entry               By default your main and bin entries from package.json will be parsed, but you can add more the list of entries by passing them in as --entry')
  console.log("--no-default-entries  Won't parse your main and bin entries from package.json will be parsed")
  console.log('--detective           Pointing to a requireable path of a javascript file containing an alternative implementation of the detective module that supports extended or alternate syntaxes')
  console.log("--extensions, -e      Comma-separated list of file extensions to use when resolving require paths. Eg. 'js,jsx'")
  console.log('--version             Show current version')
  console.log('--ignore              To always exit with code 0 pass --ignore')
  console.log('')

  process.exit(1)
}

var splitArg = function (arg) {
  if (!arg) return undefined

  return (typeof arg === 'string' ? arg.split(',') : arg).map(function (item) {
    item = item.trim()
    return item[0] === '.' ? item : '.' + item
  })
}

check({
  path: args._.shift(),
  entries: args._.concat(args.entry || []),
  noDefaultEntries: !args['default-entries'],
  extensions: splitArg(args.e),
  detective: args.detective
}, function (err, data) {
  if (err) {
    console.error(err.message)
    return process.exit(1)
  }
  var pkg = data.package
  var deps = data.used
  var failed = 0
  var options = {
    excludeDev: args.dev === false,
    ignore: [].concat(args.i || [])
  }
  if (args.extra) {
    var extras = check.extra(pkg, deps, options)
    failed += extras.length
    if (extras.length) {
      console.error('Fail! Modules in package.json not used in code: ' + extras.join(', '))
    } else {
      console.log('Success! All dependencies in package.json are used in the code')
    }
  }
  if (args.missing || !args.extra) {
    var missing = check.missing(pkg, deps, options)
    failed += missing.length
    if (missing.length) {
      console.error('Fail! Dependencies not listed in package.json: ' + missing.join(', '))
    } else {
      console.log('Success! All dependencies used in the code are listed in package.json')
    }
  }
  process.exit(args.ignore || !failed ? 0 : 1)
})
