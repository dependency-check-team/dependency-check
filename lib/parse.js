'use strict'

const debug = require('debug')('dependency-check')
const { resolveDep } = require('./resolve-dependency')
const { resolvePaths } = require('./resolve-paths')

/**
 * @typedef ParseOptions
 * @property {string} path
 * @property {import('read-pkg').NormalizedPackageJson} package
 * @property {import('./extensions').Extensions} extensions
 * @property {undefined|boolean} builtins
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
const parse = async function (opts) {
  const {
    builtins,
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

  if (paths.length === 0) {
    throw new Error('No entry paths found')
  }

  /** @type {Array<Promise<void>>} */
  const lookups = []

  for (const file of paths) {
    lookups.push(resolveDep(file, extensions, { deps, seen, core }))
  }

  await Promise.all(lookups)

  return {
    'package': pkg,
    used: [...deps],
    ...(builtins ? { builtins: [...core] } : {})
  }
}

module.exports = {
  parse
}
