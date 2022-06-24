
import { resolve } from 'node:path'
import createDebug from 'debug'
import { globby } from 'globby'

const debug = createDebug('dependency-check')

/**
 * @param {string|string[]} entries
 * @param {string} cwd
 * @returns {Promise<string[]>}
 */
export async function resolveGlobbedPath (entries, cwd) {
  if (typeof entries === 'string') entries = [entries]

  // replace backslashes for forward slashes for windows
  entries = unixifyPaths(entries)

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
    const normalized = resolve(entry)
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
export function unixifyPaths (values) {
  return values.map(value => unixifyPath(value))
}

/**
 * @param {string} value
 * @returns {string}
 */
export function unixifyPath (value) {
  return value.replace(/\\/g, '/')
}
