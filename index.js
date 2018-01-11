var path = require('path')
var fs = require('fs')
var readPackage = require('read-package-json')
var asyncMap = require('async/map')
var builtins = require('builtins')()
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
        parse({
          path: pkgPath,
          package: pkg,
          entries: opts.entries,
          noDefaultEntries: opts.noDefaultEntries,
          builtins: opts.builtins,
          extensions: getExtensions(opts.extensions, opts.detective)
        }, cb)
      })
    }
    parse({
      path: pkgPath,
      package: pkg,
      entries: opts.entries,
      noDefaultEntries: opts.noDefaultEntries,
      builtins: opts.builtins,
      extensions: getExtensions(opts.extensions, opts.detective)
    }, cb)
  })
}

module.exports.missing = function (pkg, deps, options) {
  var missing = []
  var config = configure(pkg, options)

  deps.map(function (used) {
    if (config.allDeps.indexOf(used) === -1 && config.ignore.indexOf(used) === -1) {
      missing.push(used)
    }
  })

  return missing
}

module.exports.extra = function (pkg, deps, options) {
  var missing = []
  var config = configure(pkg, options)

  config.allDeps.map(function (dep) {
    if (deps.indexOf(dep) === -1 && config.ignore.indexOf(dep) === -1) {
      missing.push(dep)
    }
  })

  return missing
}

function getDetective (name) {
  try {
    return name
      ? (typeof name === 'string' ? require(name) : name)
      : require('detective')
  } catch (e) {}
}

function noopDetective () {
  return []
}

function getExtensions (extensions, detective) {
  // Initialize extensions with node.js default handlers.
  var result = {
    '.js': noopDetective,
    '.node': noopDetective,
    '.json': noopDetective
  }

  if (Array.isArray(extensions)) {
    extensions.forEach(function (extension) {
      result[extension] = getDetective(detective)
    })
  } else if (typeof extensions === 'object') {
    Object.keys(extensions).forEach(function (extension) {
      result[extension] = getDetective(extensions[extension] || detective)
    })
  }

  // Reset the `detective` instance for `.js` when it hasn't been set. This is
  // done to defer loading detective when not needed and to keep `.js` first in
  // the order of `Object.keys` (matching node.js behavior).
  if (result['.js'] === noopDetective) {
    result['.js'] = getDetective(detective)
  }

  return result
}

function configure (pkg, options) {
  options = options || {}

  var allDeps = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.peerDependencies || {}))
  var ignore = options.ignore || []

  if (typeof ignore === 'string') ignore = [ignore]

  if (!options.excludePeer) {
    allDeps = allDeps.concat(Object.keys(pkg.peerDependencies || {}))
  }

  if (!options.excludeDev) {
    allDeps = allDeps.concat(Object.keys(pkg.devDependencies || {}))
  }

  return {
    allDeps: allDeps,
    ignore: ignore
  }
}

function isNotRelative (file) {
  return isRelative(file) && file[0] !== '.'
}

function parse (opts, cb) {
  var pkgPath = opts.path
  var pkg = opts.package
  var extensions = opts.extensions

  var deps = {}
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

  asyncMap(paths, function (file, cb) {
    resolveDep(file, cb)
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

  function resolveDep (file, callback) {
    if (isNotRelative(file)) {
      return callback(null)
    }

    return resolve(file, {
      basedir: path.dirname(file),
      extensions: Object.keys(extensions)
    }, function (err, path) {
      if (err) return callback(err)

      return getDeps(path, callback)
    })
  }

  function getDeps (file, callback) {
    var ext = path.extname(file)
    var detective = extensions[ext] || extensions['.js']

    if (typeof detective !== 'function') {
      return callback(new Error('Detective function missing for "' + file + '"'))
    }

    fs.readFile(file, 'utf8', read)

    function read (err, contents) {
      if (err) return callback(err)

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
            req = path.resolve(path.dirname(file), req)
            if (seen.indexOf(req) === -1) {
              seen.push(req)
              relatives.push(req)
            }
          }
        }
      })

      asyncMap(relatives, function (name, cb) {
        resolveDep(name, cb)
      }, done)
    }

    function done (err) {
      return callback(err, deps)
    }
  }
}
