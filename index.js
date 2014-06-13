var path = require('path')
var fs = require('fs')
var readPackage = require('read-package-json')
var detective = require('detective')
var async = require('async')
var builtins = require('builtins')
var resolve = require('resolve')

module.exports = function(pkgPath, cb) {
  readPackage(pkgPath, function(err, pkg) {
    if (err && err.code === 'EISDIR') {
      pkgPath = path.join(pkgPath, 'package.json')
      return readPackage(pkgPath, function(err, pkg) {
      if (err) return cb(err)
        parse(pkgPath, pkg, cb)
      })
    }
    parse(pkgPath, pkg, cb)
  })
}

function parse(pkgPath, pkg, cb) {
  var mainPath = path.resolve(pkg.main || path.join(path.dirname(pkgPath), 'index.js'))
  getDeps(mainPath, path.dirname(pkgPath), cb)
  
  var deps = {}
  
  function getDeps(file, basedir, callback) {
    var IS_NOT_RELATIVE = /^[^\\\/]+$/
    
    if (IS_NOT_RELATIVE.test(file)) {
      return callback(null)
    }
    
    file = path.resolve(basedir, file)
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = resolve.sync(file, { basedir: basedir })
    }
    
    fs.readFile(file, 'utf8', read)
    
    function read(err, contents) {
      if (err) {
        return callback(err)
      }
      
      var requires = detective(contents)
      var relatives = []
      requires.map(function(req) {
        if (IS_NOT_RELATIVE.test(req) && builtins.indexOf(req) === -1) { deps[req] = true }
        else relatives.push(req)
      })
      
      async.map(relatives, function(name, cb) {
        getDeps(name, basedir, cb)
      }, gotDeps)
    }
    
    function gotDeps(err) {
      if (err) {
        return callback(err)
      }
      var missing = []
      var allDeps = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {}))
      Object.keys(deps).map(function(used) {
        if (allDeps.indexOf(used) === -1) missing.push(used)
      })
      callback(null, missing)
    }
  }
}
