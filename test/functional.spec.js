/// <reference types="node" />
/// <reference types="mocha" />
/// <reference types="chai" />

'use strict'

const chai = require('chai')

chai.should()

const {
  check,
  extra,
  missing
} = require('..')

describe('functional', () => {
  it('should correctly handle a simple case', async () => {
    const result = await check({ path: 'test/mock-negative/' })

    extra(result.package, result.used).should.deep.equal(['@scope/test1'])
    missing(result.package, result.used).should.deep.equal(['node:foobar', 'example', 'example2'])
  })

  it('should correctly handle a typescript case', async () => {
    const result = await check({ path: 'test/mock-negative/abc.ts' })

    extra(result.package, result.used).should.deep.equal(['@scope/test1'])
    missing(result.package, result.used).should.deep.equal(['example3', 'example2'])
  })
})
