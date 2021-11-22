'use strict'

const path = require('path')
const { readFile } = require('fs').promises
const builtins = require('module').builtinModules
const isRelative = require('is-relative')
const resolveModule = require('resolve')
const debug = require('debug')('dependency-check')

/** @type {(file: string, options: import('resolve').AsyncOpts) => Promise<string>} */
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
/** @typedef {{ deps: Set<string>, seen: Set<string>, core: Set<string> }} DependencyContext */

/**
 * @param {string} file
 * @param {import('./extensions').Extensions} extensions
 * @param {DependencyContext} context
 * @returns {Promise<void>}
 */
const getDeps = async function (file, extensions, { deps, seen, core }) {
  const ext = path.extname(file)
  const detective = extensions[ext]

  if (typeof detective !== 'function') {
    return Promise.reject(new Error('Detective function missing for "' + file + '"'))
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
      req = path.resolve(path.dirname(file), req)
      if (!seen.has(req)) {
        seen.add(req)
        relatives.push(req)
      }
    }
  }

  await Promise.all(relatives.map(name => resolveDep(name, extensions, { deps, seen, core })))
}

/**
 * @param {string} file
 * @param {import('./extensions').Extensions} extensions
 * @param {DependencyContext} context
 * @returns {Promise<void>}
 */
const resolveDep = async function (file, extensions, { deps, seen, core }) {
  if (isNotRelative(file)) return

  const resolvedPath = await promisedResolveModule(file, {
    basedir: path.dirname(file),
    extensions: Object.keys(extensions)
  })

  return getDeps(resolvedPath, extensions, { deps, seen, core })
}

module.exports = {
  resolveDep
}
