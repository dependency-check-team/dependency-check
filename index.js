var path = require('path')
var fs = require('fs')
var readPackage = require('read-package-json')
var detective = require('detective')
var async = require('async')
var builtins = require('builtins')
var resolve = require('resolve')
var debug = require('debug')('dependency-check')
var isRelative = require('is-relative')

module.exports = function (opts, cb) {
  var pkgPath = opts.path
  readPackage(pkgPath, function (err, pkg) {
    if (err && err.code === 'EISDIR') {
      pkgPath = path.join(pkgPath, 'package.json')
      return readPackage(pkgPath, function (err, pkg) {
        if (err) return cb(err)
        parse({path: pkgPath, package: pkg, entries: opts.entries, noDefaultEntries: opts.noDefaultEntries, builtins: opts.builtins}, cb)
      })
    }
    parse({path: pkgPath, package: pkg, entries: opts.entries, noDefaultEntries: opts.noDefaultEntries, builtins: opts.builtins}, cb)
  })
}

module.exports.missing = function (pkg, deps) {
  var missing = []
  var allDeps = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {})).concat(Object.keys(pkg.peerDependencies || {}))

  deps.map(function (used) {
    if (allDeps.indexOf(used) === -1) missing.push(used)
  })

  return missing
}

module.exports.extra = function (pkg, deps, options) {
  options = options || {}

  var missing = []
  var allDeps = Object.keys(pkg.dependencies || {})
  var ignore = options.ignore || []

  if (typeof ignore === 'string') ignore = [ignore]

  if (!options.excludeDev) {
    allDeps = allDeps.concat(Object.keys(pkg.devDependencies || {}))
  }

  allDeps.map(function (dep) {
    if (deps.indexOf(dep) === -1 && ignore.indexOf(dep) === -1) missing.push(dep)
  })

  return missing
}

function isNotRelative (file) {
  return isRelative(file) && file[0] !== '.'
}

function parse (opts, cb) {
  var deps = {}

  var pkgPath = opts.path
  var pkg = opts.package

  var paths = []
  var seen = []
  var core = []
  var mainPath = path.resolve(pkg.main || path.join(path.dirname(pkgPath), 'index.js'))
  if (!opts.noDefaultEntries && fs.existsSync(mainPath)) paths.push(mainPath)

  if (!opts.noDefaultEntries && pkg.bin) {
    if (typeof pkg.bin === 'string') {
      paths.push(path.resolve(path.join(path.dirname(pkgPath), pkg.bin)))
    } else {
      Object.keys(pkg.bin).forEach(function (cmdName) {
        var cmd = pkg.bin[cmdName]
        paths.push(path.resolve(path.join(path.dirname(pkgPath), cmd)))
      })
    }
  }

  // pass in custom additional entries e.g. ['./test.js']
  if (opts.entries) {
    if (typeof opts.entries === 'string') opts.entries = [opts.entries]
    opts.entries.forEach(function (entry) {
      entry = path.resolve(path.join(path.dirname(pkgPath), entry))
      if (paths.indexOf(entry) === -1) {
        paths.push(entry)
      }
    })
  }

  debug('entry paths', paths)

  if (paths.length === 0) return cb(new Error('No entry paths found'))

  async.map(paths, function (file, cb) {
    getDeps(file, path.dirname(pkgPath), cb)
  }, function (err, allDeps) {
    if (err) return cb(err)
    var used = {}
    // merge all deps into one unique list
    allDeps.forEach(function (deps) {
      Object.keys(deps).forEach(function (dep) {
        used[dep] = true
      })
    })
    if (opts.builtins) return cb(null, {package: pkg, used: Object.keys(used), builtins: core})

    cb(null, {package: pkg, used: Object.keys(used)})
  })

  function getDeps (file, basedir, callback) {
    if (isNotRelative(file)) {
      return callback(null)
    }

    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      var filename = './' + path.basename(file)
      debug('resolve', [path.dirname(file), filename])
      file = resolve.sync(filename, { basedir: path.dirname(file) })
    }

    fs.readFile(file, 'utf8', read)

    function read (err, contents) {
      if (err) {
        return callback(err)
      }

      var requires = detective(contents)
      var relatives = []
      requires.map(function (req) {
        var isCore = builtins.indexOf(req) > -1
        if (isNotRelative(req) && !isCore) {
          // require('foo/bar') -> require('foo')
          if (req[0] !== '@' && req.indexOf('/') > -1) req = req.split('/')[0]
          else if (req[0] === '@') req = req.split('/').slice(0, 2).join('/')
          debug('require("' + req + '")' + ' is a dependency')
          deps[req] = true
        } else {
          if (isCore) {
            debug('require("' + req + '")' + ' is core')
            if (core.indexOf(req) === -1) {
              core.push(req)
            }
          } else {
            debug('require("' + req + '")' + ' is relative')
            var orig = req
            req = path.resolve(path.dirname(file), req)
            if (seen.indexOf(req) === -1) {
              seen.push(req)

              // dont parse JSON
              var ext = path.extname(req)
              if (ext === '.json') return debug('skipping JSON', orig)

              relatives.push(req)
            }
          }
        }
      })

      async.map(relatives, function (name, cb) {
        getDeps(name, basedir, cb)
      }, done)
    }

    function done (err) {
      if (err) {
        return callback(err)
      }
      callback(null, deps)
    }
  }
}
