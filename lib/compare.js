'use strict'

const micromatch = require('micromatch')

/**
 * @typedef DependencyOptions
 * @property {boolean} [excludeDev]
 * @property {boolean} [excludePeer]
 * @property {string|string[]} [ignore]
 */

/**
 * @param {import('read-pkg').NormalizedPackageJson} pkg
 * @param {DependencyOptions} [options]
 * @returns {{ allDeps: string[], ignore: string[] }}
 */
const configure = function (pkg, options = {}) {
  if (!pkg || typeof pkg !== 'object') throw new TypeError('Expected a pkg object')

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
 * @param {import('read-pkg').NormalizedPackageJson} pkg
 * @param {string[]} deps
 * @param {DependencyOptions} [options]
 * @returns {string[]}
 */
const missing = function (pkg, deps, options) {
  /** @type {string[]} */
  const missing = []
  const config = configure(pkg, options)

  if (!Array.isArray(deps)) throw new TypeError('Expected a deps array')

  for (const used of deps) {
    if (!config.allDeps.includes(used) && !micromatch.isMatch(used, config.ignore)) {
      missing.push(used)
    }
  }

  return missing
}

/**
 * @param {import('read-pkg').NormalizedPackageJson} pkg
 * @param {string[]} deps
 * @param {DependencyOptions} [options]
 * @returns {string[]}
 */
const extra = function (pkg, deps, options) {
  /** @type {string[]} */
  const missing = []
  const config = configure(pkg, options)

  if (!Array.isArray(deps)) throw new TypeError('Expected a deps array')

  for (const dep of config.allDeps) {
    if (!deps.includes(dep) && !micromatch.isMatch(dep, config.ignore)) {
      missing.push(dep)
    }
  }

  return missing
}

module.exports = {
  extra,
  missing
}
