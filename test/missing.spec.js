/// <reference types="node" />
/// <reference types="mocha" />
/// <reference types="chai" />

import chai from 'chai'

import { missing } from '../index.js'
import {
  mockDevPeerPkg,
  mockPkg,
  mockUsed,
} from './mocks.js'

const should = chai.should()

describe('missing()', () => {
  it('should throw on missing pkg', () => {
    should.throw(() => {
      // @ts-ignore
      missing()
    }, TypeError, 'Expected a pkg object')
  })

  it('should throw on non-array deps', () => {
    should.throw(() => {
      // @ts-ignore
      missing(mockPkg())
    }, TypeError, 'Expected a deps array')
  })

  it('should pass when given empty package', () => {
    // @ts-ignore
    const result = missing({}, mockUsed())

    should.exist(result)
    result.should.deep.equal(mockUsed())
  })

  it('should pass when given proper input', () => {
    const result = missing(mockPkg(), mockUsed())

    should.exist(result)
    result.should.be.an('array').that.is.empty
  })

  it('should ignore unused dependencies from pkg', () => {
    const result = missing(mockPkg(), [])

    should.exist(result)
    result.should.be.an('array').which.is.empty
  })

  it('should return used dependencies not in pkg', () => {
    const deps = [...mockUsed(), 'an-extra-dependency']

    const result = missing(mockPkg(), deps)

    should.exist(result)
    result.should.be.an('array').of.length(1).with.members(['an-extra-dependency'])
  })

  it('should ignore explicitly ignored dependencies', () => {
    const result = missing({
      '_id': 'test@0.0.1',
      'dependencies': {
        'minimist': '*',
        'resolve': '*',
      },
      'name': 'test',
      'readme': 'ERROR: No README data found!',
      'version': '0.0.1',
    }, [
      'async',
      'resolve',
      '@scope/test1',
      '@scope/test2',
      'minimist',
    ], {
      ignore: '@scope/test1'
    })

    should.exist(result)
    result.should.deep.equal(['async', '@scope/test2'])
  })

  it('should support wildcards in explicitly ignored dependencies', () => {
    const result = missing({
      '_id': 'test@0.0.1',
      'dependencies': {
        'minimist': '*',
        'resolve': '*',
      },
      'name': 'test',
      'readme': 'ERROR: No README data found!',
      'version': '0.0.1',
    }, [
      'async',
      'resolve',
      '@scope/test1',
      '@scope/test2',
      'minimist',
    ], {
      ignore: '@scope/*'
    })

    should.exist(result)
    result.should.deep.equal(['async'])
  })

  it('should support multiple explicitly ignored dependencies', () => {
    const result = missing({
      '_id': 'test@0.0.1',
      'dependencies': {
        'resolve': '*',
      },
      'name': 'test',
      'readme': 'ERROR: No README data found!',
      'version': '0.0.1',
    }, [
      'async',
      'resolve',
      '@scope/test1',
      '@scope/test2',
      'minimist',
    ], {
      ignore: ['@scope/*', 'async']
    })

    should.exist(result)
    result.should.deep.equal(['minimist'])
  })

  it('should ignore dev dependencies when requested', () => {
    const result = missing(mockDevPeerPkg(), mockUsed(), { excludeDev: true })

    should.exist(result)
    result.should.be.an('array').of.length(2).with.members([
      '@scope/test2',
      'async',
    ])
  })

  it('should ignore peer dependencies when requested', () => {
    const result = missing(mockDevPeerPkg(), mockUsed(), { excludePeer: true })

    should.exist(result)
    result.should.be.an('array').of.length(2).with.members([
      'minimist',
      'resolve',
    ])
  })

  it('should ignore both dev and peer dependencies when requested', () => {
    const result = missing(mockDevPeerPkg(), mockUsed(), { excludeDev: true, excludePeer: true })

    should.exist(result)
    result.should.be.an('array').of.length(4).with.members([
      '@scope/test2',
      'async',
      'minimist',
      'resolve',
    ])
  })
})
