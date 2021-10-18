'use strict'

const path = require('path')
const debug = require('debug')('dependency-check')

/**
 * @param {string|string[]} entries
 * @param {string} cwd
 * @returns {Promise<string[]>}
 */
const resolveGlobbedPath = async function (entries, cwd) {
  if (typeof entries === 'string') entries = [entries]

  // replace backslashes for forward slashes for windows
  entries = unixifyPaths(entries)

  const { globby } = await import('globby')

  debug('globby resolving', entries)

  const resolvedEntries = await globby(entries, {
    cwd: unixifyPath(cwd),
    absolute: true,
    expandDirectories: false
  })

  /** @type {Set<string>} */
  const paths = new Set()

  for (const entry of resolvedEntries) {
    // Globby yields unix-style paths.
    const normalized = path.resolve(entry)
    paths.add(normalized)
  }

  const pathsArray = [...paths]

  debug('globby resolved', pathsArray)

  return pathsArray
}

/**
 * @param {string[]} values
 * @returns {string[]}
 */
const unixifyPaths = (values) => values.map(value => unixifyPath(value))

/**
 * @param {string} value
 * @returns {string}
 */
const unixifyPath = (value) => value.replace(/\\/g, '/')

module.exports = {
  resolveGlobbedPath,
  unixifyPath,
  unixifyPaths
}
