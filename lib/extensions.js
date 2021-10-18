'use strict'

const { ErrorWithCause } = require('pony-cause')

/** @type {Record<string, string>} */
const extensionMapping = {
  '.js': 'precinct/es6',
  '.jsx': 'precinct/es6',
  '.mjs': 'precinct/es6',
  '.cjs': 'precinct/commonjs',
  '.ts': 'precinct/ts',
  '.tsx': 'precinct/tsx',
}

const noopExtensions = new Set([
  '.node',
  '.json'
])

/** @typedef {(contents: string) => string[]} Detective */
/** @typedef {{ [extension: string]: Detective | string | undefined }} ExtensionsInput */
/** @typedef {{ [extension: string]: Detective | undefined }} Extensions */

/** @type {Detective} */
const noopDetective = () => []

/**
 * @param {string|Detective} [name]
 * @returns {Detective}
 */
const getDetective = function (name) {
  if (name === '-') return noopDetective

  /** @type {string|undefined} */
  let precinctType

  // Allows the use of precinct/foo to add a precinct detective with type 'foo' to a custom extension
  if (typeof name === 'string' && name.startsWith('precinct/')) {
    precinctType = name.slice('precinct/'.length)
    name = undefined
  }

  if (name) {
    try {
      // eslint-disable-next-line security/detect-non-literal-require
      return typeof name === 'string' ? require(name) : name
    } catch (err) {
      throw new ErrorWithCause(`Failed to load detective '${name}'`, { cause: err })
    }
  }

  /** @type {(contents: string, options: { type?: string, es6?: { mixedImports: boolean }|undefined}) => string[]} */
  // @ts-ignore There is no declaration for the precinct module
  const precinct = require('precinct')

  if (!precinctType) throw new Error('Expected a "precinct/something", but got "precinct/"')

  return (contents) => (precinctType && precinct(contents, {
    type: precinctType,
    es6: precinctType && ['es6', 'commonjs'].includes(precinctType) ? { mixedImports: true } : undefined
  })) || []
}

/**
 * @param {string} extension
 * @param {Detective | string | undefined} detective
 * @returns {Detective}
 */
const getDetectiveForExtension = function (extension, detective) {
  if (noopExtensions.has(extension)) {
    return getDetective('-')
  }

  return getDetective(detective || extensionMapping[extension])
}

/**
 * @param {string[]|ExtensionsInput|undefined} extensions
 * @param {string|Detective|undefined} detective
 * @returns {Extensions}
 */
const getExtensions = function (extensions, detective) {
  /** @type {Extensions} */
  const result = {}

  if (Array.isArray(extensions)) {
    for (const extension of extensions) {
      result[extension] = getDetectiveForExtension(extension, detective)
    }
  } else if (typeof extensions === 'object') {
    for (const extension in extensions) {
      if (extensions[extension]) {
        result[extension] = getDetective(extensions[extension])
      } else {
        result[extension] = getDetectiveForExtension(extension, detective)
      }
    }
  } else if (extensions) {
    throw new TypeError('Requires extensions argument to be an array or object')
  }

  if (detective && typeof detective !== 'function' && typeof detective !== 'string') {
    throw new TypeError('Requires detective to be a string or a function')
  }

  if (Object.keys(result).length === 0) {
    for (const extension of [...Object.keys(extensionMapping), ...noopExtensions]) {
      result[extension] = getDetectiveForExtension(extension, detective)
    }
  }

  return result
}

module.exports = {
  getExtensions
}
