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

const promisedReadPackage = promisify(readPackage)
/**
 * @param {string} file
 * @param {import('resolve').AsyncOpts} options
 * @returns {Promise<string>}
 */
const promisedResolveModule = (file, options) => new Promise((resolve, reject) => {
  resolveModule(file, options, (err, path) => {
    if (err) return reject(err)
    resolve(path)
  })
})

/**
 * @param {string|string[]} entries
 * @param {string} [cwd]
 * @returns {Promise<string[]>}
 */
async function resolveGlobbedPath (entries, cwd) {
  if (typeof entries === 'string') entries = [entries]

  debug('globby resolving', entries)

  const resolvedEntries = await globby(entries, {
    cwd,
    absolute: true,
    expandDirectories: false
  })

  const paths = Object.keys(resolvedEntries.reduce((result, entry) => {
    // Globby yields unix-style paths.
    const normalized = path.resolve(entry)

    if (!result[normalized]) {
      result[normalized] = true
    }

    return result
  }, {}))

  debug('globby resolved', paths)

  return paths
}

/**
 * @param {string} targetPath
 * @returns {Promise<undefined|{ pkgPath: string, pkg: import('type-fest').PackageJson, targetEntries?: never}>}
 */
async function resolveModuleTarget (targetPath) {
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

  if (!pkg || !pkgPath) return undefined

  return {
    pkgPath,
    pkg
  }
}

/**
 * @param {string} targetPath
 * @returns {Promise<undefined|{ pkgPath: string, pkg: import('type-fest').PackageJson, targetEntries: string[]}>}
 */
async function resolveEntryTarget (targetPath) {
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

/** @typedef {Omit<ParseOptions, 'path'> & { path: string }} DependencyCheckOptions */

/**
 * @param {DependencyCheckOptions} options
 */
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
  } = await resolveModuleTarget(targetPath) || await resolveEntryTarget(targetPath) || {}

  entries = targetEntries ? [...targetEntries, ...entries] : entries
  extensions = getExtensions(extensions, detective)
  noDefaultEntries = noDefaultEntries || (targetEntries && targetEntries.length !== 0)

  return parse({
    builtins,
    entries,
    extensions,
    noDefaultEntries,
    package: pkg,
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

/** @typedef {() => string[]} Detective */

/**
 * @param {Detective|string|undefined} name
 * @returns {Detective|undefined}
 */
function getDetective (name) {
  try {
    return name
      ? (typeof name === 'string' ? require(name) : name)
      : require('detective')
  } catch (e) {}
}

/** @type {Detective} */
function noopDetective () {
  return []
}

/** @typedef {string[]|{ [extension: string]: Detective | undefined }} Extensions */

/**
 * @param {Extensions|undefined} extensions
 * @param {Detective|string} detective
 * @returns {{ [extension: string]: Detective }}
 */
function getExtensions (extensions, detective) {
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
    result['.js'] = getDetective(detective) || noopDetective
  }

  return result
}

function configure (pkg, options) {
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

function isNotRelative (file) {
  return isRelative(file) && file[0] !== '.'
}

function joinAndResolvePath (basePath, targetPath) {
  return path.resolve(path.join(basePath, targetPath))
}

/**
 * @param {ParseOptions} opts
 * @returns {Promise<string[]>}
 */
async function resolveDefaultEntriesPaths (opts) {
  const pkgPath = opts.path
  const pkgDir = path.dirname(pkgPath)
  const pkg = opts.package

  const mainPath = joinAndResolvePath(pkgDir, pkg.main || 'index.js')

  const paths = []

  // Add the path of the main file
  try {
    await promisedFsAccess(mainPath)
    paths.push(mainPath)
  } catch (err) {}

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

/**
 * @param {ParseOptions} opts
 * @returns {Promise<string[]>}
 */
async function resolvePaths (opts) {
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

/**
 * @typedef ParseOptions
 * @property {string} path
 * @property {import('type-fest').PackageJson} package
 * @property {string[]} [entries]
 * @property {boolean} [noDefaultEntries]
 * @property {Extensions} [extensions]
 * @property {Detective|string} [detective]
 * @property {boolean} [builtins]
 */

/**
 * @param {ParseOptions} opts
 */
async function parse (opts) {
  const pkg = opts.package
  const extensions = opts.extensions

  const deps = {}
  const seen = []
  const core = []

  const paths = await resolvePaths(opts)

  debug('entry paths', paths)

  if (paths.length === 0) return Promise.reject(new Error('No entry paths found'))

  const allDeps = await Promise.all(paths.map(file => resolveDep(file)))

  const used = new Set()
  // merge all deps into one unique list
  for (const deps of allDeps) {
    for (const dep in deps) {
      used.add(dep)
    }
  }

  return {
    package: pkg,
    used: Array.from(used),
    ...(opts.builtins ? { builtins: core } : {})
  }

  async function resolveDep (file) {
    if (isNotRelative(file)) {
      return null
    }

    const resolvedPath = await promisedResolveModule(file, {
      basedir: path.dirname(file),
      extensions: Object.keys(extensions)
    })

    return getDeps(resolvedPath)
  }

  async function getDeps (file) {
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

    await Promise.all(relatives.map(name => resolveDep(name)))

    return deps
  }
}
