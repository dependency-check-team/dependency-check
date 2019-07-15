'use strict'

const path = require('path')
const fs = require('fs')
const readPackage = require('read-package-json')
const builtins = require('module').builtinModules
const resolveModule = require('resolve')
const debug = require('debug')('dependency-check')
const isRelative = require('is-relative')
const globby = require('globby')
const micromatch = require('micromatch')
const pkgUp = require('pkg-up')

const promisedReadPackage = function (pkgPath) {
  return new Promise((resolve, reject) => {
    readPackage(pkgPath, (err, pkg) => {
      if (err) return reject(err)
      resolve(pkg)
    })
  })
}

const resolveGlobbedPath = function (entries, cwd) {
  const paths = []

  if (typeof entries === 'string') entries = [entries]

  debug('globby resolving', entries)

  globby.sync(entries, {
    cwd,
    absolute: true,
    expandDirectories: false
  }).forEach(entry => {
    // Globby yields unix-style paths.
    const normalized = path.resolve(entry)

    if (!paths.includes(normalized)) {
      paths.push(normalized)
    }
  })

  debug('globby resolved', paths)

  return paths
}

module.exports = function (opts, cb) {
  let pkgPath = opts.path
  let entries

  const result = promisedReadPackage(pkgPath)
    .catch(err => {
      if (!err) {
        return Promise.reject(new Error('Failed to read package.json, but received no error'))
      } else if (pkgPath.endsWith('/package.json') || pkgPath === 'package.json') {
        return Promise.reject(new Error('Failed to read package.json: ' + err.message))
      } else if (err.code === 'EISDIR') {
        pkgPath = path.join(pkgPath, 'package.json')
        return promisedReadPackage(pkgPath)
      }

      // We've likely been given entries rather than a package.json or module path, try resolving that instead
      entries = resolveGlobbedPath(pkgPath)

      if (!entries[0]) {
        return Promise.reject(new Error('Failed to find package.json, could not find any matching files'))
      }

      opts.noDefaultEntries = true
      pkgPath = pkgUp.sync({ cwd: path.dirname(entries[0]) })

      return promisedReadPackage(pkgPath)
    })
    .then(pkg => parse({
      path: pkgPath,
      package: pkg,
      entries: (entries || []).concat(opts.entries),
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
    if (!config.allDeps.includes(used) && !micromatch.isMatch(used, config.ignore)) {
      missing.push(used)
    }
  })

  return missing
}

module.exports.extra = function (pkg, deps, options) {
  const missing = []
  const config = configure(pkg, options)

  config.allDeps.map(dep => {
    if (!deps.includes(dep) && !micromatch.isMatch(dep, config.ignore)) {
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

function joinAndResolvePath (basePath, targetPath) {
  return path.resolve(path.join(basePath, targetPath))
}

function resolveDefaultEntriesPaths (opts) {
  const pkgPath = opts.path
  const pkgDir = path.dirname(pkgPath)
  const pkg = opts.package

  const mainPath = joinAndResolvePath(pkgDir, pkg.main || 'index.js')

  let paths = []

  // Add the path of the main file
  if (fs.existsSync(mainPath)) paths.push(mainPath)

  // Add the path of binaries
  if (pkg.bin) {
    const binPaths = typeof pkg.bin === 'string'
      ? [pkg.bin]
      : Object.values(pkg.bin)

    binPaths.forEach(cmd => {
      paths.push(joinAndResolvePath(pkgDir, cmd))
    })
  }

  return paths
}

function resolvePaths (opts) {
  return [
    ...(!opts.noDefaultEntries ? resolveDefaultEntriesPaths(opts) : []),
    ...(opts.entries ? resolveGlobbedPath(opts.entries, path.dirname(opts.path)) : [])
  ]
}

function parse (opts) {
  const pkg = opts.package
  const extensions = opts.extensions

  const deps = {}
  const seen = []
  const core = []

  const paths = resolvePaths(opts)

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
          const isCore = builtins.includes(req)
          if (isNotRelative(req) && !isCore) {
            // require('foo/bar') -> require('foo')
            if (req[0] !== '@' && req.includes('/')) req = req.split('/')[0]
            else if (req[0] === '@') req = req.split('/').slice(0, 2).join('/')
            debug('require("' + req + '")' + ' is a dependency')
            deps[req] = true
          } else {
            if (isCore) {
              debug('require("' + req + '")' + ' is core')
              if (!core.includes(req)) {
                core.push(req)
              }
            } else {
              debug('require("' + req + '")' + ' is relative')
              req = path.resolve(path.dirname(file), req)
              if (!seen.includes(req)) {
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
