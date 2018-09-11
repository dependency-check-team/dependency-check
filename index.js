'use strict'

const path = require('path')
const fs = require('fs')
const readPackage = require('read-package-json')
const builtins = require('builtins')()
const resolveModule = require('resolve')
const debug = require('debug')('dependency-check')
const isRelative = require('is-relative')
const globby = require('globby')

const promisedReadPackage = function (pkgPath) {
  return new Promise((resolve, reject) => {
    readPackage(pkgPath, (err, pkg) => {
      if (err) return reject(err)
      resolve(pkg)
    })
  })
}

module.exports = function (opts, cb) {
  let pkgPath = opts.path
  const result = promisedReadPackage(pkgPath)
    .catch(err => {
      if (err && err.code === 'EISDIR') {
        pkgPath = path.join(pkgPath, 'package.json')
        return promisedReadPackage(pkgPath)
      }
      return Promise.reject(err)
    })
    .then(pkg => parse({
      path: pkgPath,
      package: pkg,
      entries: opts.entries,
      noDefaultEntries: opts.noDefaultEntries,
      builtins: opts.builtins,
      extensions: getExtensions(opts.extensions, opts.detective)
    }))

  if (cb) {
    result
      .then(value => { cb(null, value) })
      .catch(err => { cb(err) })
    return
  }

  return result
}

module.exports.missing = function (pkg, deps, options) {
  const missing = []
  const config = configure(pkg, options)

  deps.map(used => {
    if (config.allDeps.indexOf(used) === -1 && config.ignore.indexOf(used) === -1) {
      missing.push(used)
    }
  })

  return missing
}

module.exports.extra = function (pkg, deps, options) {
  const missing = []
  const config = configure(pkg, options)

  config.allDeps.map(dep => {
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
  const result = {
    '.js': noopDetective,
    '.node': noopDetective,
    '.json': noopDetective
  }

  if (Array.isArray(extensions)) {
    extensions.forEach(extension => {
      result[extension] = getDetective(detective)
    })
  } else if (typeof extensions === 'object') {
    Object.keys(extensions).forEach(extension => {
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

  let allDeps = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.peerDependencies || {}))
  let ignore = options.ignore || []

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

function parse (opts) {
  const pkgPath = opts.path
  const pkg = opts.package
  const extensions = opts.extensions

  const deps = {}
  const paths = []
  const seen = []
  const core = []
  const mainPath = path.resolve(pkg.main || path.join(path.dirname(pkgPath), 'index.js'))
  if (!opts.noDefaultEntries && fs.existsSync(mainPath)) paths.push(mainPath)

  if (!opts.noDefaultEntries && pkg.bin) {
    if (typeof pkg.bin === 'string') {
      paths.push(path.resolve(path.join(path.dirname(pkgPath), pkg.bin)))
    } else {
      Object.keys(pkg.bin).forEach(cmdName => {
        const cmd = pkg.bin[cmdName]
        paths.push(path.resolve(path.join(path.dirname(pkgPath), cmd)))
      })
    }
  }

  // pass in custom additional entries e.g. ['./test.js']
  if (opts.entries) {
    if (typeof opts.entries === 'string') opts.entries = [opts.entries]

    globby.sync(opts.entries, {
      cwd: path.dirname(pkgPath),
      absolute: true,
      expandDirectories: false
    }).forEach(entry => {
      // Globby yields unix-style paths.
      const normalized = path.resolve(entry)

      if (paths.indexOf(normalized) === -1) {
        paths.push(normalized)
      }
    })
  }

  debug('entry paths', paths)

  if (paths.length === 0) return Promise.reject(new Error('No entry paths found'))

  return Promise.all(paths.map(file => resolveDep(file)))
    .then(allDeps => {
      const used = {}
      // merge all deps into one unique list
      allDeps.forEach(deps => {
        Object.keys(deps).forEach(dep => {
          used[dep] = true
        })
      })

      if (opts.builtins) return { package: pkg, used: Object.keys(used), builtins: core }

      return { package: pkg, used: Object.keys(used) }
    })

  function resolveDep (file) {
    if (isNotRelative(file)) {
      return Promise.resolve(null)
    }

    return new Promise((resolve, reject) => {
      resolveModule(file, {
        basedir: path.dirname(file),
        extensions: Object.keys(extensions)
      }, (err, path) => {
        if (err) return reject(err)
        resolve(path)
      })
    })
      .then(path => getDeps(path))
  }

  function getDeps (file) {
    const ext = path.extname(file)
    const detective = extensions[ext] || extensions['.js']

    if (typeof detective !== 'function') {
      return Promise.reject(new Error('Detective function missing for "' + file + '"'))
    }

    return new Promise((resolve, reject) => {
      fs.readFile(file, 'utf8', (err, contents) => {
        if (err) return reject(err)
        resolve(contents)
      })
    })
      .then(contents => {
        const requires = detective(contents)
        const relatives = []
        requires.map(req => {
          const isCore = builtins.indexOf(req) > -1
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

        return Promise.all(relatives.map(name => resolveDep(name)))
          .then(() => deps)
      })
  }
}
