'use strict'

const path = require('path')
const {
  access: promisedFsAccess,
  readFile
} = require('fs').promises
const readPkg = require('read-pkg')
const builtins = require('module').builtinModules
const resolveModule = require('resolve')
const debug = require('debug')('dependency-check')
const isRelative = require('is-relative')
const globby = require('globby')
const micromatch = require('micromatch')
const pkgUp = require('pkg-up')
const { ErrorWithCause } = require('pony-cause')

// TODO: Look into avoiding exporting the types for: ResolveDefaultEntriesPathsOptions, ResolvePathsOptions, DependencyContext, ParseOptions

/** @type {(file: string, options: import('resolve').AsyncOpts) => Promise<string>} */
const promisedResolveModule = (file, options) => new Promise((resolve, reject) => {
  resolveModule(file, options, (err, path) => {
    if (err) return reject(err)
    if (path === undefined) return reject(new Error('Could not resolve a module path'))
    resolve(path)
  })
})

/**
 * @param {string[]} values
 * @returns {string[]}
 */
const unixifyPaths = (values) => values.map(value => unixifyPath(value))
/**
 * @param {string} value
 * @returns {string}
 */
const unixifyPath = (value) => value.replace(/\\/g, '/')

/** @typedef {(contents: string) => string[]} Detective */
/** @typedef {{ [extension: string]: Detective | undefined }} Extensions */

/**
 * @param {string|string[]} entries
 * @param {string} cwd
 * @returns {Promise<string[]>}
 */
const resolveGlobbedPath = async function (entries, cwd) {
  if (typeof entries === 'string') entries = [entries]

  // replace backslashes for forward slashes for windows
  entries = unixifyPaths(entries)

  debug('globby resolving', entries)

  const resolvedEntries = await globby(entries, {
    cwd: unixifyPath(cwd),
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

/**
 * @param {string} targetPath
 * @returns {Promise<undefined|{ pkgPath: string, pkg: import('type-fest').PackageJson, targetEntries?: never}>}
 */
const resolveModuleTarget = async function (targetPath) {
  let cwd

  targetPath = unixifyPath(targetPath)

  if (targetPath.endsWith('/package.json')) {
    cwd = path.dirname(targetPath)
  } else if (targetPath === 'package.json') {
    cwd = process.cwd()
  } else {
    cwd = targetPath
  }

  try {
    const pkg = await readPkg({ cwd })
    const pkgPath = path.join(cwd, 'package.json')

    return {
      pkgPath,
      pkg
    }
  } catch (err) {
    if (targetPath.endsWith('/package.json') || targetPath === 'package.json') {
      throw new ErrorWithCause('Failed to read package.json', { cause: err })
    }
    // Else just fail silently so we can fall back to next lookup method
    // eslint-disable-next-line no-useless-return
    return
  }
}

/**
 * @param {string} targetPath
 * @returns {Promise<undefined|{ pkgPath: string, pkg: import('type-fest').PackageJson, targetEntries: string[]}>}
 */
const resolveEntryTarget = async function (targetPath) {
  // We've been given an entry path pattern as the target rather than a package.json or module folder
  // We'll resolve those entries and then finds us the package.json from the location of those
  const targetEntries = await resolveGlobbedPath(targetPath, process.cwd())

  if (!targetEntries[0]) {
    throw new Error('Failed to find package.json, no file to resolve it from')
  }

  const pkgPath = await pkgUp({ cwd: path.dirname(targetEntries[0]) })

  const resolved = pkgPath && await resolveModuleTarget(pkgPath)

  if (!resolved) return

  return {
    ...resolved,
    targetEntries
  }
}

/**
 * @typedef CheckOptions
 * @property {string} path
 * @property {string[]} [entries]
 * @property {boolean} [noDefaultEntries]
 * @property {Extensions|string[]} [extensions]
 * @property {Detective|string} [detective]
 * @property {boolean} [builtins]
 */

/**
 * @param {CheckOptions} opts
 * @returns {Promise<ParseResult>}
 */
const check = async function ({
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

  if (!pkg || !pkgPath) {
    throw new Error('Failed to find a package.json')
  }

  return parse({
    builtins,
    entries: [...(targetEntries || []), ...(entries || [])],
    extensions: getExtensions(extensions, detective),
    noDefaultEntries: noDefaultEntries || (targetEntries && targetEntries.length !== 0),
    'package': pkg,
    path: pkgPath
  })
}

/**
 * @param {import('type-fest').PackageJson} pkg
 * @param {string[]} deps
 * @param {DependencyOptions} [options]
 * @returns {string[]}
 */
const missing = function (pkg, deps, options) {
  const missing = []
  const config = configure(pkg, options)

  for (const used of deps) {
    if (!config.allDeps.includes(used) && !micromatch.isMatch(used, config.ignore)) {
      missing.push(used)
    }
  }

  return missing
}

/**
 * @param {import('type-fest').PackageJson} pkg
 * @param {string[]} deps
 * @param {DependencyOptions} [options]
 * @returns {string[]}
 */
const extra = function (pkg, deps, options) {
  const missing = []
  const config = configure(pkg, options)

  for (const dep of config.allDeps) {
    if (!deps.includes(dep) && !micromatch.isMatch(dep, config.ignore)) {
      missing.push(dep)
    }
  }

  return missing
}

/**
 * @param {string|Detective} [name]
 * @returns {Detective}
 */
const getDetective = function (name) {
  /** @type {string|undefined} */
  let precinctType

  // Allows the use of precinct/foo to add a precinct detective with type 'foo' to a custom extension
  if (typeof name === 'string' && name.startsWith('precinct/')) {
    precinctType = name.slice('precinct/'.length)
    name = undefined
  }

  try {
    if (name) {
      // eslint-disable-next-line security/detect-non-literal-require
      return typeof name === 'string' ? require(name) : name
    }

    /** @type {(contents: string, options: { type?: string, es6?: { mixedImports: boolean }}) => string[]} */
    // @ts-ignore There is no declaration for the precinct module
    const precinct = require('precinct')

    if (!precinctType) throw new Error('Expected a precinctType, but got none')

    return (contents) => precinct(contents, {
      type: precinctType,
      es6: precinctType && ['es6', 'commonjs'].includes(precinctType) ? { mixedImports: true } : undefined
    })
  } catch (err) {
    throw new ErrorWithCause(`Failed to load detective '${name}'`, { cause: err })
  }
}

/** @type {Detective} */
const noopDetective = () => []

/**
 * @param {string[]|Extensions|undefined} extensions
 * @param {string|Detective|undefined} detective
 * @returns {Extensions}
 */
const getExtensions = function (extensions, detective) {
  /** @type {Extensions} */
  const result = {}

  if (Array.isArray(extensions)) {
    for (const extension of extensions) {
      result[extension] = getDetective(detective)
    }
  } else if (typeof extensions === 'object') {
    for (const extension in extensions) {
      result[extension] = getDetective(extensions[extension] || detective)
    }
  }

  result['.js'] = result['.js'] || getDetective(detective || 'precinct/es6')
  result['.jsx'] = result['.jsx'] || getDetective(detective || 'precinct/es6')
  result['.mjs'] = result['.mjs'] || getDetective(detective || 'precinct/es6')
  result['.cjs'] = result['.cjs'] || getDetective(detective || 'precinct/commonjs')
  result['.ts'] = result['.ts'] || getDetective(detective || 'precinct/ts')
  result['.tsx'] = result['.tsx'] || getDetective(detective || 'precinct/tsx')
  result['.node'] = result['.node'] || noopDetective
  result['.json'] = result['.json'] || noopDetective

  return result
}

/**
 * @typedef DependencyOptions
 * @property {boolean} [excludeDev]
 * @property {boolean} [excludePeer]
 * @property {string|string[]} [ignore]
 */

/**
 * @param {import('type-fest').PackageJson} pkg
 * @param {DependencyOptions} [options]
 * @returns {{ allDeps: string[], ignore: string[] }}
 */
const configure = function (pkg, options = {}) {
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

/**
 * @param {string} file
 * @returns {boolean}
 */
const isNotRelative = (file) => isRelative(file) && file[0] !== '.'

/**
 * @param {string} basePath
 * @param {string} targetPath
 * @returns {string}
 */
const joinAndResolvePath = (basePath, targetPath) => path.resolve(path.join(basePath, targetPath))

/**
 * @typedef ResolveDefaultEntriesPathsOptions
 * @property {string} path
 * @property {import('type-fest').PackageJson} package
 */

/**
 * @param {ResolveDefaultEntriesPathsOptions} opts
 * @returns {Promise<string[]>}
 */
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

  // TODO: Add browser field, styles field, es6 module style ones etc

  return paths
}

/**
 * @typedef ResolvePathsOptions
 * @property {string} path
 * @property {import('type-fest').PackageJson} package
 * @property {undefined|boolean} noDefaultEntries
 * @property {undefined|string[]} entries
 */

/**
 * @param {ResolvePathsOptions} opts
 * @returns {Promise<string[]>}
 */
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

/** @typedef {{ deps: Set<string>, seen: Set<string>, core: Set<string> }} DependencyContext */

/**
 * @param {string} file
 * @param {Extensions} extensions
 * @param {DependencyContext} context
 * @returns {Promise<void>}
 */
const getDeps = async function (file, extensions, { deps, seen, core }) {
  const ext = path.extname(file)
  const detective = extensions[ext]

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
      if (req[0] !== '@' && req.includes('/')) req = req.split('/')[0] || ''
      else if (req[0] === '@') req = req.split('/').slice(0, 2).join('/')
      debug('require("' + req + '")' + ' is a dependency')
      deps.add(req)
    } else {
      if (isCore) {
        debug('require("' + req + '")' + ' is core')
        core.add(req)
      } else {
        debug('require("' + req + '")' + ' is relative')
        req = path.resolve(path.dirname(file), req)
        if (!seen.has(req)) {
          seen.add(req)
          relatives.push(req)
        }
      }
    }
  }

  await Promise.all(relatives.map(name => resolveDep(name, extensions, { deps, seen, core })))
}

/**
 * @param {string} file
 * @param {Extensions} extensions
 * @param {DependencyContext} context
 * @returns {Promise<void>}
 */
const resolveDep = async function (file, extensions, { deps, seen, core }) {
  if (isNotRelative(file)) return

  const resolvedPath = await promisedResolveModule(file, {
    basedir: path.dirname(file),
    extensions: Object.keys(extensions)
  })

  return getDeps(resolvedPath, extensions, { deps, seen, core })
}

/**
 * @typedef ParseOptions
 * @property {string} path
 * @property {import('type-fest').PackageJson} package
 * @property {Extensions} extensions
 * @property {undefined|boolean} builtins
 * @property {undefined|boolean} noDefaultEntries
 * @property {undefined|string[]} entries
 */

/**
 * @typedef ParseResult
 * @property {import('type-fest').PackageJson} package
 * @property {string[]} used
 * @property {string[]} [builtins]
 */

/**
 * @param {ParseOptions} opts
 * @returns {Promise<ParseResult>}
 */
const parse = async function (opts) {
  const {
    entries,
    extensions,
    noDefaultEntries,
    'package': pkg,
    path: basePath,
  } = opts

  /** @type {Set<string>} */
  const deps = new Set()
  /** @type {Set<string>} */
  const seen = new Set()
  /** @type {Set<string>} */
  const core = new Set()

  const paths = await resolvePaths({
    path: basePath,
    'package': pkg,
    entries,
    noDefaultEntries,
  })

  debug('entry paths', paths)

  if (paths.length === 0) return Promise.reject(new Error('No entry paths found'))

  const lookups = []

  for (const file of paths) {
    lookups.push(resolveDep(file, extensions, { deps, seen, core }))
  }

  await Promise.all(lookups)

  return {
    'package': pkg,
    used: [...deps],
    ...(opts.builtins ? { builtins: [...core] } : {})
  }
}

module.exports = {
  check,
  extra,
  missing,
}
