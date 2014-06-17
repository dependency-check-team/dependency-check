var path = require('path')
var fs = require('fs')
var readPackage = require('read-package-json')
var detective = require('detective')
var async = require('async')
var builtins = require('builtins')
var resolve = require('resolve')
var debug = require('debug')('dependency-check')

module.exports = function(opts, cb) {
  var pkgPath = opts.path
  readPackage(pkgPath, function(err, pkg) {
    if (err && err.code === 'EISDIR') {
      pkgPath = path.join(pkgPath, 'package.json')
      return readPackage(pkgPath, function(err, pkg) {
      if (err) return cb(err)
        parse({path: pkgPath, package: pkg, entries: opts.entries}, cb)
      })
    }
    parse({path: pkgPath, package: pkg, entries: opts.entries}, cb)
  })
}

module.exports.missing = function(pkg, deps) {
  var missing = []
  var allDeps = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {}))
  
  deps.map(function(used) {
    if (allDeps.indexOf(used) === -1) missing.push(used)
  })
  
  return missing
}

module.exports.extra = function(pkg, deps) {
  var missing = []
  var allDeps = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {}))
  
  allDeps.map(function(dep) {
    if (deps.indexOf(dep) === -1) missing.push(dep)
  })

  return missing
}

function parse(opts, cb) {
  debug('parsing ' + opts.path)
  // stolen from https://github.com/conradz/browserify-graph
  var IS_NOT_RELATIVE = /^[^\\\/\.]/
  
  var deps = {}
  
  var pkgPath = opts.path
  var pkg = opts.package
  
  var paths = []
  var mainPath = path.resolve(pkg.main || path.join(path.dirname(pkgPath), 'index.js'))
  paths.push(mainPath)
  
  if (pkg.bin) {
    if (typeof pkg.bin === 'string') {
      paths.push(path.resolve(path.join(path.dirname(pkgPath), pkg.bin)))
    } else {
      Object.keys(pkg.bin).forEach(function(cmdName) {
        var cmd = pkg.bin[cmdName]
        paths.push(path.resolve(path.join(path.dirname(pkgPath), cmd)))
      })
    }
  }
  
  // pass in custom additional entries e.g. ['./test.js']
  if (opts.entries) {
    if (typeof opts.entries === 'string') opts.entries = [opts.entries]
    opts.entries.forEach(function(entry) {
      paths.push(path.resolve(path.join(path.dirname(pkgPath), entry)))
    })
  }
  
  async.map(paths, function(file, cb) {
    getDeps(file, path.dirname(pkgPath), cb)
  }, function(err, allDeps) {
    if (err) return cb(err)
    var used = {}
    // merge all deps into one unique list
    allDeps.forEach(function(deps) {
      Object.keys(deps).forEach(function(dep) {
        used[dep] = true
      })
    })
    cb(null, {package: pkg, used: Object.keys(used)})
  })
  
  function getDeps(file, basedir, callback) {
    if (IS_NOT_RELATIVE.test(file)) {
      return callback(null)
    }
    
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      var filename = './' + path.basename(file)
      debug('resolve', [path.dirname(file), filename])
      file = resolve.sync(filename, { basedir: path.dirname(file) })
    }
    
    fs.readFile(file, 'utf8', read)
    
    function read(err, contents) {
      if (err) {
        return callback(err)
      }
      
      var requires = detective(contents)
      var relatives = []
      requires.map(function(req) {
        var isCore = builtins.indexOf(req) > 0
        if (IS_NOT_RELATIVE.test(req) && !isCore) {
          // require('foo/bar') -> require('foo')
          if (req.indexOf('/') > -1) req = req.split('/')[0]
          debug('require("' + req + '")' + ' is a dependency')
          deps[req] = true
        } else {
          if (isCore) {
            debug('require("' + req + '")' + ' is core')
          } else {
            debug('require("' + req + '")' + ' is relative')
            relatives.push(path.resolve(path.dirname(file), req))
          }
        }
      })
      
      async.map(relatives, function(name, cb) {
        getDeps(name, basedir, cb)
      }, done)
    }
    
    function done(err) {
      if (err) {
        return callback(err)
      }
      callback(null, deps)
    }
  }
}
