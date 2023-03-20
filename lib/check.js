
import { getExtensions } from './extensions.js'
import { parse } from './parse.js'

import { resolveEntryTarget, resolveModuleTarget } from './resolve-target.js'

/**
 * @typedef CheckOptions
 * @property {string} path
 * @property {string[]} [entries]
 * @property {boolean} [noDefaultEntries]
 * @property {boolean} [ignoreUnknownExtensions]
 * @property {import('./extensions').ExtensionsInput|string[]} [extensions]
 * @property {import('./extensions').Detective|string|undefined} [detective]
 * @property {boolean} [builtins]
 */

/**
 * @param {CheckOptions} opts
 * @returns {Promise<import('./parse').ParseResult>}
 */
export async function check (opts) {
  if (!opts) throw new Error('Requires an opts argument to be set')

  const {
    builtins,
    detective,
    entries,
    extensions,
    ignoreUnknownExtensions,
    noDefaultEntries,
    path: targetPath
  } = opts

  if (!targetPath) throw new Error('Requires a path to be set')
  if (typeof targetPath !== 'string') throw new TypeError(`Requires path to be a string, got: ${typeof targetPath}`)

  const {
    pkg,
    pkgPath,
    targetEntries
  } = await resolveModuleTarget(targetPath) || await resolveEntryTarget(targetPath) || {}

  if (!pkg || !pkgPath) {
    throw new Error('Failed to find a package.json')
  }

  return parse({
    builtins,
    entries: [...(targetEntries || []), ...(entries || [])],
    extensions: await getExtensions(extensions, detective),
    ignoreUnknownExtensions,
    noDefaultEntries: noDefaultEntries || (targetEntries && targetEntries.length !== 0),
    'package': pkg,
    path: pkgPath
  })
}
