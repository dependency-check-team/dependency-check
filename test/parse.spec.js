/// <reference types="node" />
/// <reference types="mocha" />
/// <reference types="chai" />

'use strict'

const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')

chai.use(chaiAsPromised)
chai.should()

const {
  parse
} = require('../lib/parse')

const {
  mockPkg
} = require('./mocks')

describe('parse()', () => {
  it('should throw on missing files', async () => {
    await parse({
      path: 'foo/**/*',
      'package': mockPkg(),
      extensions: {},
      builtins: undefined,
      noDefaultEntries: undefined,
      entries: undefined,
    })
      .should.be.rejectedWith(Error, 'No entry paths found')
  })
})
