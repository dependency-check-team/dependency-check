/* eslint-disable unicorn/no-useless-undefined */
/// <reference types="node" />
/// <reference types="mocha" />
/// <reference types="chai" />

'use strict'

const chai = require('chai')
const { ErrorWithCause } = require('pony-cause')

const should = chai.should()

const {
  getExtensions
} = require('../lib/extensions')

const defaultDetective = () => []
const specificDetective = () => []

describe('getExtensions()', () => {
  it('should throw on invalid extensions argument', () => {
    should.throw(
      // @ts-ignore
      () => { getExtensions(true) },
      TypeError,
      'Requires extensions argument to be an array or object'
    )
  })

  it('should throw on invalid detective argument', () => {
    should.throw(
      // @ts-ignore
      () => { getExtensions(undefined, true) },
      TypeError,
      'Requires detective to be a string or a function'
    )
  })

  it('should return default setup on no input', () => {
    const result = getExtensions(undefined, undefined)

    should.exist(should)

    result.should.have.all.keys([
      '.cjs',
      '.js',
      '.json',
      '.jsx',
      '.mjs',
      '.node',
      '.ts',
      '.tsx',
    ])

    result.should.have.property('.cjs').which.is.a('function')
  })

  it('should only return requested extensions', () => {
    const result = getExtensions(['.js', '.json'], undefined)

    should.exist(should)

    result.should.have.all.keys([
      '.js',
      '.json',
    ])

    result.should.have.property('.js').which.is.a('function')
  })

  it('should use provided detectives', () => {
    const extensions = {
      '.js': undefined,
      '.json': specificDetective
    }

    const result = getExtensions(extensions, defaultDetective)

    should.exist(should)

    result.should.deep.equal({
      '.js': defaultDetective,
      '.json': specificDetective,
    })
  })

  it('should default to noop-detective for .json and .node', () => {
    const extensions = {
      '.js': specificDetective,
      '.cjs': undefined,
      '.json': undefined,
      '.node': undefined
    }

    const result = getExtensions(extensions, defaultDetective)

    should.exist(should)

    result.should.have.all.keys([
      '.js',
      '.cjs',
      '.json',
      '.node',
    ])

    result.should.have.property('.js', specificDetective)
    result.should.have.property('.cjs', defaultDetective)
    result.should.have.property('.json').which.is.a('function').and.is.not.equal(defaultDetective)
    result.should.have.property('.node').which.is.a('function').and.is.not.equal(defaultDetective)
  })

  it('should use named detective', () => {
    const extensions = {
      '.js': undefined,
      '.mjs': undefined,
      '.cjs': 'detective-cjs'
    }

    const result = getExtensions(extensions, defaultDetective)

    should.exist(should)

    result.should.have.all.keys([
      '.js',
      '.mjs',
      '.cjs',
    ])

    result.should.have.property('.js').which.is.a('function').and.equals(defaultDetective)
    result.should.have.property('.mjs').which.is.a('function').and.equals(result['.js'])
    result.should.have.property('.cjs').which.is.a('function').and.is.not.equal(result['.js'])
  })

  it('should throw on missing precinct type', () => {
    should.throw(
      () => { getExtensions(undefined, 'precinct/') },
      Error,
      'Expected a "precinct/something", but got "precinct/"'
    )
  })

  it('should throw on missing detective module', () => {
    should.throw(
      () => { getExtensions(undefined, '@dependency-check-team/yet-another-missing-module') },
      ErrorWithCause,
      "Failed to load detective '@dependency-check-team/yet-another-missing-module'"
    )
  })
})
