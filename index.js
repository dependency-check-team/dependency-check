'use strict'

const path = require('path')
const {
  access: promisedFsAccess,
  readFile
} = require('fs').promises
const { promisify } = require('util')
const readPackage = require('read-package-json')
const builtins = require('module').builtinModules
const resolveModule = require('resolve')
const debug = require('debug')('dependency-check')
const isRelative = require('is-relative')
const globby = require('globby')
const micromatch = require('micromatch')
const pkgUp = require('pkg-up')
const VError = require('verror')

const promisedReadPackage = promisify(readPackage)
const promisedResolveModule = (file, options) => new Promise((resolve, reject) => {
  resolveModule(file, options, (err, path) => {
    if (err) return reject(err)
    resolve(path)
  })
})

const resolveGlobbedPath = async function (entries, cwd) {
  if (typeof entries === 'string') entries = [entries]

  // replace backslashes for forward slashes for windows
  entries = entries.map(entry => entry.replace(/\\/g, '/'))

  debug('globby resolving', entries)

  const resolvedEntries = await globby(entries, {
    cwd,
    absolute: true,
    expandDirectories: false
  })

  const paths = new Set()

  for (const entry of resolvedEntries) {
    // Globby yields unix-style paths.
    const normalized = path.resolve(entry)

    paths.add(normalized)
  }

  const pathsArray = [...paths]

  debug('globby resolved', pathsArray)

  return pathsArray
}

const resolveModuleTarget = async function (targetPath) {
  let pkgPath, pkg

  try {
    pkg = await promisedReadPackage(targetPath)
    pkgPath = targetPath
  } catch (err) {
    if (targetPath.endsWith('/package.json') || targetPath === 'package.json') {
      throw new Error('Failed to read package.json: ' + err.message)
    }

    if (err && err.code === 'EISDIR') {
      // We were given a path to a module folder
      pkgPath = path.join(targetPath, 'package.json')
      pkg = await promisedReadPackage(pkgPath)
    }
  }

  if (!pkg) return

  return {
    pkgPath,
    pkg
  }
}

const resolveEntryTarget = async function (targetPath) {
  // We've been given an entry path pattern as the target rather than a package.json or module folder
  // We'll resolve those entries and then finds us the package.json from the location of those
  const targetEntries = await resolveGlobbedPath(targetPath)

  if (!targetEntries[0]) {
    throw new Error('Failed to find package.json, no file to resolve it from')
  }

  const pkgPath = await pkgUp({ cwd: path.dirname(targetEntries[0]) })

  if (!pkgPath) {
    throw new Error('Failed to find a package.json')
  }

  const pkg = await promisedReadPackage(pkgPath)

  return {
    pkgPath,
    pkg,
    targetEntries
  }
}

module.exports = async function ({
  builtins,
  detective,
  entries,
  extensions,
  noDefaultEntries,
  path: targetPath
}) {
  if (!targetPath) throw new Error('Requires a path to be set')

  const {
    pkgPath,
    pkg,
    targetEntries
  } = await resolveModuleTarget(targetPath) || await resolveEntryTarget(targetPath)

  entries = targetEntries ? [...targetEntries, ...entries] : entries
  extensions = getExtensions(extensions, detective)
  noDefaultEntries = noDefaultEntries || (targetEntries && targetEntries.length !== 0)

  return parse({
    builtins,
    entries,
    extensions,
    noDefaultEntries,
    'package': pkg,
    path: pkgPath
  })
}

module.exports.missing = function (pkg, deps, options) {
  const missing = []
  const config = configure(pkg, options)

  for (const used of deps) {
    if (!config.allDeps.includes(used) && !micromatch.isMatch(used, config.ignore)) {
      missing.push(used)
    }
  }

  return missing
}

module.exports.extra = function (pkg, deps, options) {
  const missing = []
  const config = configure(pkg, options)

  for (const dep of config.allDeps) {
    if (!deps.includes(dep) && !micromatch.isMatch(dep, config.ignore)) {
      missing.push(dep)
    }
  }

  return missing
}

const getDetective = function (name) {
  try {
    return name
      // eslint-disable-next-line security/detect-non-literal-require
      ? (typeof name === 'string' ? require(name) : name)
      : require('detective')
  } catch (err) {
    throw new VError(err, 'Failed to load detective \'%s\'', name)
  }
}

const noopDetective = () => []

const getExtensions = function (extensions, detective) {
  // Initialize extensions with node.js default handlers.
  const result = {
    '.js': noopDetective,
    '.node': noopDetective,
    '.json': noopDetective
  }

  if (Array.isArray(extensions)) {
    for (const extension of extensions) {
      result[extension] = getDetective(detective)
    }
  } else if (typeof extensions === 'object') {
    for (const extension in extensions) {
      result[extension] = getDetective(extensions[extension] || detective)
    }
  }

  // Reset the `detective` instance for `.js` when it hasn't been set. This is
  // done to defer loading detective when not needed and to keep `.js` first in
  // the order of `Object.keys` (matching node.js behavior).
  if (result['.js'] === noopDetective) {
    result['.js'] = getDetective(detective)
  }

  return result
}

const configure = function (pkg, options) {
  options = options || {}

  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...(options.excludePeer ? [] : Object.keys(pkg.peerDependencies || {})),
    ...(options.excludeDev ? [] : Object.keys(pkg.devDependencies || {}))
  ]
  const ignore = typeof options.ignore === 'string'
    ? [options.ignore]
    : (options.ignore || [])

  return {
    allDeps,
    ignore
  }
}

const isNotRelative = (file) => isRelative(file) && file[0] !== '.'

const joinAndResolvePath = (basePath, targetPath) => path.resolve(path.join(basePath, targetPath))

const resolveDefaultEntriesPaths = async function (opts) {
  const pkgPath = opts.path
  const pkgDir = path.dirname(pkgPath)
  const pkg = opts.package

  const mainPath = joinAndResolvePath(pkgDir, pkg.main || 'index.js')

  const paths = []

  // Add the path of the main file
  try {
    await promisedFsAccess(mainPath)
    paths.push(mainPath)
  } catch {}

  // Add the path of binaries
  if (pkg.bin) {
    const binPaths = typeof pkg.bin === 'string'
      ? [pkg.bin]
      : Object.values(pkg.bin)

    for (const cmd of binPaths) {
      paths.push(joinAndResolvePath(pkgDir, cmd))
    }
  }

  return paths
}

const resolvePaths = async function (opts) {
  const [
    defaultEntries,
    globbedPaths
  ] = await Promise.all([
    !opts.noDefaultEntries ? resolveDefaultEntriesPaths(opts) : [],
    opts.entries ? resolveGlobbedPath(opts.entries, path.dirname(opts.path)) : []
  ])

  return [
    ...defaultEntries,
    ...globbedPaths
  ]
}

const getDeps = async function (file, extensions, { deps, seen, core }) {
  const ext = path.extname(file)
  const detective = extensions[ext] || extensions['.js']

  if (typeof detective !== 'function') {
    return Promise.reject(new Error('Detective function missing for "' + file + '"'))
  }

  const contents = await readFile(file, 'utf8')
  const requires = detective(contents)
  const relatives = []

  for (let req of requires) {
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
  }

  await Promise.all(relatives.map(name => resolveDep(name, extensions, { deps, seen, core })))

  return deps
}

const resolveDep = async function (file, extensions, { deps, seen, core }) {
  if (isNotRelative(file)) {
    return []
  }

  const resolvedPath = await promisedResolveModule(file, {
    basedir: path.dirname(file),
    extensions: Object.keys(extensions)
  })

  return getDeps(resolvedPath, extensions, { deps, seen, core })
}

const parse = async function (opts) {
  const pkg = opts.package
  const extensions = opts.extensions

  // TODO: Make some of these sets and remove some of them
  const deps = {}
  const seen = []
  const core = []

  const paths = await resolvePaths(opts)

  debug('entry paths', paths)

  if (paths.length === 0) return Promise.reject(new Error('No entry paths found'))

  const lookups = []

  for (const file of paths) {
    lookups.push(resolveDep(file, extensions, { deps, seen, core }))
  }

  const used = new Set()
  // merge all deps into one unique list
  for (const deps of await Promise.all(lookups)) {
    for (const dep in deps) {
      used.add(dep)
    }
  }

  return {
    'package': pkg,
    used: [...used],
    ...(opts.builtins ? { builtins: core } : {})
  }
}
