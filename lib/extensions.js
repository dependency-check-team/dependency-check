'use strict'

const { ErrorWithCause } = require('pony-cause')

/** @typedef {(contents: string) => string[]} Detective */
/** @typedef {{ [extension: string]: Detective | undefined }} Extensions */

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

    /** @type {(contents: string, options: { type?: string, es6?: { mixedImports: boolean }|undefined}) => string[]} */
    // @ts-ignore There is no declaration for the precinct module
    const precinct = require('precinct')

    if (!precinctType) throw new Error('Expected a precinctType, but got none')

    return (contents) => (precinctType && precinct(contents, {
      type: precinctType,
      es6: precinctType && ['es6', 'commonjs'].includes(precinctType) ? { mixedImports: true } : undefined
    })) || []
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

module.exports = {
  getExtensions
}
