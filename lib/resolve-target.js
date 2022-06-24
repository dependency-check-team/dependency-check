import { dirname, join } from 'node:path'

import { pkgUp } from 'pkg-up'
import { ErrorWithCause } from 'pony-cause'

import { resolveGlobbedPath, unixifyPath } from './path-helpers.js'

/**
 * @param {string} targetPath
 * @returns {Promise<undefined|{ pkgPath: string, pkg: import('read-pkg').NormalizedPackageJson, targetEntries?: never}>}
 */
export async function resolveModuleTarget (targetPath) {
  /** @type {string} */
  let cwd

  targetPath = unixifyPath(targetPath)

  if (targetPath.endsWith('/package.json')) {
    cwd = dirname(targetPath)
  } else if (targetPath === 'package.json') {
    cwd = process.cwd()
  } else {
    cwd = targetPath
  }

  const { readPackage } = await import('read-pkg')

  try {
    const pkg = await readPackage({ cwd })
    const pkgPath = join(cwd, 'package.json')

    return {
      pkgPath,
      pkg
    }
  } catch (err) {
    if (targetPath.endsWith('/package.json') || targetPath === 'package.json') {
      throw new ErrorWithCause('Failed to read package.json', { cause: err })
    }
    // Else just fail silently so we can fall back to next lookup method
  }
}

/**
 * @param {string} targetPath
 * @returns {Promise<undefined|{ pkgPath: string, pkg: import('read-pkg').NormalizedPackageJson, targetEntries: string[]}>}
 */
export async function resolveEntryTarget (targetPath) {
  // We've been given an entry path pattern as the target rather than a package.json or module folder
  // We'll resolve those entries and then finds us the package.json from the location of those
  const targetEntries = await resolveGlobbedPath(targetPath, process.cwd())

  if (!targetEntries[0]) {
    throw new Error(`Failed to find package.json, path "${targetPath}" does not resolve to any file for "${process.cwd()}"`)
  }

  const pkgPath = await pkgUp({ cwd: dirname(targetEntries[0]) })

  const resolved = pkgPath && await resolveModuleTarget(pkgPath)

  if (!resolved) return

  return {
    ...resolved,
    targetEntries
  }
}
