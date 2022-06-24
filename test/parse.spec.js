/// <reference types="node" />
/// <reference types="mocha" />
/// <reference types="chai" />

import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'

import { parse } from '../lib/parse.js'
import { mockPkg } from './mocks.js'

chai.use(chaiAsPromised)
chai.should()

describe('parse()', () => {
  it('should throw on missing files', async () => {
    await parse({
      path: 'foo/**/*',
      'package': mockPkg(),
      extensions: {},
      builtins: undefined,
      ignoreUnknownExtensions: undefined,
      noDefaultEntries: undefined,
      entries: undefined,
    })
      .should.be.rejectedWith(Error, 'No entry paths found')
  })
})
