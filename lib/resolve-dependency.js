
import { extname, resolve, dirname } from 'node:path'
import { readFile } from 'node:fs/promises'
import { builtinModules as builtins } from 'node:module'

import createDebug from 'debug'
import isRelative from 'is-relative'
import resolveModule from 'resolve'

const debug = createDebug('dependency-check')

/**
 * @typedef DependencyContext
 * @property {Set<string>} core
 * @property {Set<string>} deps
 * @property {boolean} ignoreUnknownExtensions
 * @property {Set<string>} seen
 */

/**
 * @param {string} file
 * @param {import('resolve').AsyncOpts} options
 * @returns {Promise<string>}
 */
const promisedResolveModule = (file, options) => new Promise((resolve, reject) => {
  resolveModule(file, options, (err, path) => {
    if (err) return reject(err)
    if (path === undefined) return reject(new Error('Could not resolve a module path'))
    resolve(path)
  })
})

/**
 * @param {string} file
 * @returns {boolean}
 */
const isNotRelative = (file) => isRelative(file) && file[0] !== '.'

/**
 * @param {string} file
 * @param {import('./extensions').Extensions} extensions
 * @param {DependencyContext} context
 * @returns {Promise<void>}
 */
async function getDeps (file, extensions, { core, deps, ignoreUnknownExtensions, seen }) {
  const ext = extname(file)
  const detective = extensions[ext]

  if (typeof detective !== 'function') {
    if (ignoreUnknownExtensions) {
      return
    } else {
      throw new TypeError('Detective function missing for "' + file + '"')
    }
  }

  const contents = await readFile(file, 'utf8')
  const requires = detective(contents)
  /** @type {string[]} */
  const relatives = []

  for (let req of requires) {
    const isCore = builtins.includes(req.startsWith('node:') ? req.slice(5) : req)

    if (isNotRelative(req) && !isCore) {
      // require('foo/bar') -> require('foo')
      if (req[0] !== '@' && req.includes('/')) req = req.split('/')[0] || ''
      else if (req[0] === '@') req = req.split('/').slice(0, 2).join('/')
      debug('require("' + req + '")' + ' is a dependency')
      deps.add(req)
    } else if (isCore) {
      debug('require("' + req + '")' + ' is core')
      core.add(req)
    } else {
      debug('require("' + req + '")' + ' is relative')
      req = resolve(dirname(file), req)
      if (!seen.has(req)) {
        seen.add(req)
        relatives.push(req)
      }
    }
  }

  await Promise.all(relatives.map(name => resolveDep(name, extensions, { core, deps, ignoreUnknownExtensions, seen })))
}

/**
 * @param {string} file
 * @param {import('./extensions').Extensions} extensions
 * @param {DependencyContext} context
 * @returns {Promise<void>}
 */
export async function resolveDep (file, extensions, { core, deps, ignoreUnknownExtensions, seen }) {
  if (isNotRelative(file)) return

  const resolvedPath = await promisedResolveModule(file, {
    basedir: dirname(file),
    extensions: Object.keys(extensions)
  })

  return getDeps(resolvedPath, extensions, { core, deps, ignoreUnknownExtensions, seen })
}
