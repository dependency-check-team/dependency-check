#!/usr/bin/env node

var check = require('./')

var args = require('minimist')(process.argv.slice(2))

if (args.version) {
  console.log(require('./package.json').version)
  process.exit(1)
}

if (args.help || args._.length === 0) {
  console.log('\nUsage: dependency-check <path to package.json or module folder> <options>')

  console.log('\nOptions:')
  console.log('--missing (default)   Check to make sure that all modules in your code are listed in your package.json')
  console.log('--unused, --extra     The inverse of the --missing check and will tell you which modules in your package.json *were not* used in your code')
  console.log("--no-dev              Won't tell you about which devDependencies in your package.json dependencies that were not used in your code. Only usable with --unused")
  console.log("--ignore-module, -i   Won't tell you about module names passed in as --ignore-module / -i. Only usable with --unused")
  console.log('--entry               By default your main and bin entries from package.json will be parsed, but you can add more the list of entries by passing them in as --entry')
  console.log("--no-default-entries  Won't parse your main and bin entries from package.json will be parsed")
  console.log('--version             Show current version')
  console.log('--ignore              To always exit with code 0 pass --ignore')
  console.log('')

  process.exit(1)
}

check({
  path: args._[0],
  entries: args.entry,
  noDefaultEntries: args['default-entries'] === false
}, function (err, data) {
  if (err) {
    console.error(err.message)
    return process.exit(1)
  }
  var pkg = data.package
  var deps = data.used
  var results, errMsg, successMsg
  if (args.unused || args.extra) {
    results = check.extra(pkg, deps, {
      excludeDev: args.dev === false,
      ignore: [].concat(args['ignore-module'] || [], args.i || [])
    })
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
