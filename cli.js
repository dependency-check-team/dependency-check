#!/usr/bin/env node

var path = require('path')
var check = require('./')

var args = require('minimist')(process.argv.slice(2))

if (args.version) {
  return console.log(require('./package.json').version);
}

if (args.help || args._.length === 0) {
  console.log('\nUsage: dependency-check <path to package.json or module folder> <options>')

  console.log('\nOptions:')
  console.log('--missing (default)   Check to make sure that all modules in your code are listed in your package.json')
  console.log('--unused              The inverse of the --missing check and will tell you which modules in your package.json *were not* used in your code')
  console.log('--no-dev              Won\'t tell you about which devDependencies in your package.json dependencies that were not used in your code. Only usable with --unused')
  console.log('--entry               By default your main and bin entries from package.json will be parsed, but you can add more the list of entries by passing them in as --entry')
  console.log("")

  process.exit(1)
}

check({path: args._[0], entries: args.entry}, function(err, data) {
  if (err) {
    console.error(err.message)
    return process.exit(1)
  }
  var pkg = data.package
  var deps = data.used
  var results, errMsg, successMsg
  if (args.unused || args.extra) {
    results = check.extra(pkg, deps, {excludeDev: args.dev === false})
    errMsg = 'Fail! Modules in package.json not used in code: '
    successMsg = 'Success! All dependencies in package.json are used in the code'
  } else {
    results = check.missing(pkg, deps)
    errMsg = 'Fail! Dependencies not listed in package.json: '
    successMsg = 'Success! All dependencies used in the code are listed in package.json'
  }
  if (results.length === 0) {
    console.log(successMsg)
    process.exit(0)
  } else {
    console.error(errMsg + results.join(', '))
    process.exit(args.ignore ? 0 : 1)
  }
})
