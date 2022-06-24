import createDebug from 'debug'

import { resolveDep } from './resolve-dependency.js'
import { resolvePaths } from './resolve-paths.js'

const debug = createDebug('dependency-check')

/**
 * @typedef ParseOptions
 * @property {string} path
 * @property {import('read-pkg').NormalizedPackageJson} package
 * @property {import('./extensions').Extensions} extensions
 * @property {undefined|boolean} builtins
 * @property {undefined|boolean} ignoreUnknownExtensions
 * @property {undefined|boolean} noDefaultEntries
 * @property {undefined|string[]} entries
 */

/**
 * @typedef ParseResult
 * @property {import('read-pkg').NormalizedPackageJson} package
 * @property {string[]} used
 * @property {string[]} [builtins]
 */

/**
 * @param {ParseOptions} opts
 * @returns {Promise<ParseResult>}
 */
export async function parse (opts) {
  const {
    builtins,
    entries,
    extensions,
    ignoreUnknownExtensions = false,
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

  if (paths.length === 0) {
    throw new Error('No entry paths found')
  }

  /** @type {Array<Promise<void>>} */
  const lookups = []

  for (const file of paths) {
    lookups.push(resolveDep(file, extensions, { core, deps, ignoreUnknownExtensions, seen }))
  }

  await Promise.all(lookups)

  return {
    'package': pkg,
    used: [...deps],
    ...(builtins ? { builtins: [...core] } : {})
  }
}
