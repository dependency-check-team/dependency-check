'use strict'

const { getExtensions } = require('./extensions')
const { parse } = require('./parse')

const {
  resolveEntryTarget,
  resolveModuleTarget
} = require('./resolve-target')

/**
 * @typedef CheckOptions
 * @property {string} path
 * @property {string[]} [entries]
 * @property {boolean} [noDefaultEntries]
 * @property {import('./extensions').ExtensionsInput|string[]} [extensions]
 * @property {import('./extensions').Detective|string} [detective]
 * @property {boolean} [builtins]
 */

/**
 * @param {CheckOptions} opts
 * @returns {Promise<import('./parse').ParseResult>}
 */
const check = async function (opts) {
  if (!opts) throw new Error('Requires an opts argument to be set')

  const {
    builtins,
    detective,
    entries,
    extensions,
    noDefaultEntries,
    path: targetPath
  } = opts

  if (!targetPath) throw new Error('Requires a path to be set')
  if (typeof targetPath !== 'string') throw new TypeError(`Requires path to be a string, got: ${typeof targetPath}`)

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

module.exports = {
  check
}
