import picomatch from 'picomatch'

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
function configure (pkg, options = {}) {
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
export function findMissing (pkg, deps, options) {
  /** @type {string[]} */
  const missing = []
  const { allDeps, ignore } = configure(pkg, options)
  const isMatch = picomatch(ignore)

  if (!Array.isArray(deps)) throw new TypeError('Expected a deps array')

  for (const used of deps) {
    if (!allDeps.includes(used) && !isMatch(used)) {
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
export function findUnused (pkg, deps, options) {
  /** @type {string[]} */
  const missing = []
  const { allDeps, ignore } = configure(pkg, options)
  const isMatch = picomatch(ignore)

  if (!Array.isArray(deps)) throw new TypeError('Expected a deps array')

  for (const dep of allDeps) {
    if (!deps.includes(dep) && !isMatch(dep)) {
      missing.push(dep)
    }
  }

  return missing
}
