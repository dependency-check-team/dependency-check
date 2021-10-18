/// <reference types="node" />
/// <reference types="mocha" />
/// <reference types="chai" />

'use strict'

const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')

chai.use(chaiAsPromised)
chai.should()

const {
  check
} = require('..')

describe('check()', () => {
  it('should throw on invalid input', async () => {
    // @ts-ignore
    await check()
      .should.be.rejectedWith(TypeError, 'Requires an opts argument to be set')
  })
})
