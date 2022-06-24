
import { resolve, join, dirname } from 'node:path'
import { access as promisedFsAccess } from 'node:fs/promises'

import { resolveGlobbedPath } from './path-helpers.js'

/**
 * @param {string} basePath
 * @param {string} targetPath
 * @returns {string}
 */
const joinAndResolvePath = (basePath, targetPath) => resolve(join(basePath, targetPath))

/**
 * @typedef ResolveDefaultEntriesPathsOptions
 * @property {string} path
 * @property {import('read-pkg').NormalizedPackageJson} package
 */

/**
 * @param {ResolveDefaultEntriesPathsOptions} opts
 * @returns {Promise<string[]>}
 */
async function resolveDefaultEntriesPaths (opts) {
  const pkgPath = opts.path
  const pkgDir = dirname(pkgPath)
  const pkg = opts.package

  const mainPath = joinAndResolvePath(pkgDir, pkg.main || 'index.js')

  /** @type {string[]} */
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
 * @property {import('read-pkg').NormalizedPackageJson} package
 * @property {undefined|boolean} noDefaultEntries
 * @property {undefined|string[]} entries
 */

/**
 * @param {ResolvePathsOptions} opts
 * @returns {Promise<string[]>}
 */
export async function resolvePaths (opts) {
  const [
    defaultEntries,
    globbedPaths
  ] = await Promise.all([
    !opts.noDefaultEntries ? resolveDefaultEntriesPaths(opts) : [],
    opts.entries ? resolveGlobbedPath(opts.entries, dirname(opts.path)) : []
  ])

  return [
    ...defaultEntries,
    ...globbedPaths
  ]
}
