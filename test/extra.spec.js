/// <reference types="node" />
/// <reference types="mocha" />
/// <reference types="chai" />

import chai from 'chai'

import { extra } from '../index.js'
import {
  mockDevPeerPkg,
  mockPkg,
  mockUsed,
} from './mocks.js'

const should = chai.should()

describe('extra()', () => {
  it('should throw on missing pkg', () => {
    should.throw(() => {
      // @ts-ignore
      extra()
    }, TypeError, 'Expected a pkg object')
  })

  it('should throw on non-array deps', () => {
    should.throw(() => {
      // @ts-ignore
      extra(mockPkg())
    }, TypeError, 'Expected a deps array')
  })

  it('should pass when given empty package', () => {
    // @ts-ignore
    const result = extra({}, mockUsed())

    should.exist(result)
    result.should.be.an('array').that.is.empty
  })

  it('should pass when given proper input', () => {
    const result = extra(mockPkg(), mockUsed())

    should.exist(result)
    result.should.be.an('array').that.is.empty
  })

  it('should return unused dependencies from pkg', () => {
    const count = 2
    const deps = mockUsed()
    const removed = deps.splice(0, count)

    const result = extra(mockPkg(), deps)

    should.exist(result)
    result.should.be.an('array').of.length(count).with.members(removed)
  })

  it('should ignore used dependencies not in pkg', () => {
    const deps = [...mockUsed(), 'an-extra-dependency']

    const result = extra(mockPkg(), deps)

    should.exist(result)
    result.should.be.an('array').that.is.empty
  })

  it('should ignore explicitly ignored dependencies', () => {
    const result = extra({
      '_id': 'test@0.0.1',
      'dependencies': {
        '@scope/test1': '*',
        '@scope/test2': '*',
        'async': '*',
        'minimist': '*',
        'resolve': '*',
      },
      'name': 'test',
      'readme': 'ERROR: No README data found!',
      'version': '0.0.1',
    }, [
      'minimist',
      'resolve'
    ], {
      ignore: '@scope/test1'
    })

    should.exist(result)
    result.should.deep.equal(['@scope/test2', 'async'])
  })

  it('should support wildcards in explicitly ignored dependencies', () => {
    const result = extra({
      '_id': 'test@0.0.1',
      'dependencies': {
        '@scope/test1': '*',
        '@scope/test2': '*',
        'async': '*',
        'minimist': '*',
        'resolve': '*',
      },
      'name': 'test',
      'readme': 'ERROR: No README data found!',
      'version': '0.0.1',
    }, [
      'minimist',
      'resolve'
    ], {
      ignore: '@scope/*'
    })

    should.exist(result)
    result.should.deep.equal(['async'])
  })

  it('should support multiple explicitly ignored dependencies', () => {
    const result = extra({
      '_id': 'test@0.0.1',
      'dependencies': {
        '@scope/test1': '*',
        '@scope/test2': '*',
        'async': '*',
        'minimist': '*',
        'resolve': '*',
      },
      'name': 'test',
      'readme': 'ERROR: No README data found!',
      'version': '0.0.1',
    }, [
      'resolve'
    ], {
      ignore: ['@scope/*', 'async']
    })

    should.exist(result)
    result.should.deep.equal(['minimist'])
  })

  it('should return unused dependencies from all dependency types', () => {
    const deps = mockUsed()

    const result = extra(mockDevPeerPkg(), [])

    should.exist(result)
    result.should.be.an('array').of.length(deps.length).with.members(deps)
  })

  it('should ignore dev dependencies when requested', () => {
    const result = extra(mockDevPeerPkg(), [], { excludeDev: true })

    should.exist(result)
    result.should.be.an('array').of.length(3).with.members([
      '@scope/test1',
      'minimist',
      'resolve',
    ])
  })

  it('should ignore peer dependencies when requested', () => {
    const result = extra(mockDevPeerPkg(), [], { excludePeer: true })

    should.exist(result)
    result.should.be.an('array').of.length(3).with.members([
      '@scope/test1',
      '@scope/test2',
      'async',
    ])
  })

  it('should ignore both dev and peer dependencies when requested', () => {
    const result = extra(mockDevPeerPkg(), [], { excludeDev: true, excludePeer: true })

    should.exist(result)
    result.should.be.an('array').of.length(1).with.members([
      '@scope/test1',
    ])
  })
})
