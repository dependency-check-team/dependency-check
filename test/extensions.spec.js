/* eslint-disable unicorn/no-useless-undefined */
/// <reference types="node" />
/// <reference types="mocha" />
/// <reference types="chai" />

import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'

import { ErrorWithCause } from 'pony-cause'

import { getExtensions } from '../lib/extensions.js'

chai.use(chaiAsPromised)

const should = chai.should()

const defaultDetective = () => []
const specificDetective = () => []

describe('getExtensions()', () => {
  it('should throw on invalid extensions argument', async () => {
    // @ts-ignore
    await getExtensions(true).should.be.rejectedWith(
      TypeError,
      'Requires extensions argument to be an array or object'
    )
  })

  it('should throw on invalid detective argument', async () => {
    // @ts-ignore
    await getExtensions(undefined, true).should.be.rejectedWith(
      TypeError,
      'Requires detective to be a string or a function'
    )
  })

  it('should return default setup on no input', async () => {
    const result = await getExtensions(undefined, undefined)

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

  it('should only return requested extensions', async () => {
    const result = await getExtensions(['.js', '.json'], undefined)

    should.exist(should)

    result.should.have.all.keys([
      '.js',
      '.json',
    ])

    result.should.have.property('.js').which.is.a('function')
  })

  it('should use provided detectives', async () => {
    const extensions = {
      '.js': undefined,
      '.json': specificDetective
    }

    const result = await getExtensions(extensions, defaultDetective)

    should.exist(should)

    result.should.deep.equal({
      '.js': defaultDetective,
      '.json': specificDetective,
    })
  })

  it('should default to noop-detective for .json and .node', async () => {
    const extensions = {
      '.js': specificDetective,
      '.cjs': undefined,
      '.json': undefined,
      '.node': undefined
    }

    const result = await getExtensions(extensions, defaultDetective)

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

  it('should use named detective', async () => {
    const extensions = {
      '.js': undefined,
      '.mjs': undefined,
      '.cjs': 'detective-cjs'
    }

    const result = await getExtensions(extensions, defaultDetective)

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

  it('should throw on missing precinct type', async () => {
    await getExtensions(undefined, 'precinct/').should.be.rejectedWith(
      Error,
      'Expected a "precinct/something", but got "precinct/"'
    )
  })

  it('should throw on missing detective module', async () => {
    await getExtensions(undefined, '@dependency-check-team/yet-another-missing-module').should.be.rejectedWith(
      ErrorWithCause,
      "Failed to load detective '@dependency-check-team/yet-another-missing-module'"
    )
  })
})
