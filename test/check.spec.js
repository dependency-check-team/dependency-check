/// <reference types="node" />
/// <reference types="mocha" />
/// <reference types="chai" />

import { sep } from 'node:path'

import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'

import { check } from '../index.js'
import { mockPkg, mockUsed } from './mocks.js'

chai.use(chaiAsPromised)

const should = chai.should()

describe('check()', () => {
  it('should throw on missing input', async () => {
    // @ts-ignore
    await check()
      .should.be.rejectedWith(Error, 'Requires an opts argument to be set')
  })

  it('should throw on invalid input', async () => {
    // @ts-ignore
    await check({})
      .should.be.rejectedWith(Error, 'Requires a path to be set')
  })

  it('should throw on invalid path', async () => {
    // @ts-ignore
    await check({ path: true })
      .should.be.rejectedWith(TypeError, 'Requires path to be a string, got: boolean')
  })

  it('should throw when finding no package.json', async () => {
    await check({ path: './yet/another/missing/path' })
      .should.be.rejectedWith(Error, `Failed to find package.json, path "./yet/another/missing/path" does not resolve to any file for "${process.cwd()}"`)
  })

  it('should resolve when given given proper input', async () => {
    const result = await check({ path: 'test/mock-positive/' })

    should.exist(result)
    result.should.have.property('package').that.deep.equals(mockPkg())
    result.should.have.property('used').with.members(mockUsed())
    result.should.not.have.property('builtins')
  })

  it('should return used builtins when requested', async () => {
    const result = await check({
      path: 'test/mock-positive/',
      builtins: true
    })

    should.exist(result)
    result.should.have.property('package').that.deep.equals(mockPkg())
    result.should.have.property('used').with.members(mockUsed())
    result.should.have.property('builtins').which.deep.equals(['path'])
  })

  it('should be able to skip default entries', async () => {
    const result = await check({
      path: 'test/mock-positive/',
      noDefaultEntries: true,
      entries: ['scoped.js']
    })

    should.exist(result)
    result.should.have.property('package').that.deep.equals(mockPkg())
    result.should.have.property('used').with.members([
      '@scope/test1',
      '@scope/test2'
    ])
  })

  it('should throw when finding no entries', async () => {
    await check({
      path: 'test/mock-positive/',
      noDefaultEntries: true
    })
      .should.be.rejectedWith(Error, 'No entry paths found')
  })

  it('should add bin files defined in package.json as default entry', async () => {
    const result = await check({
      path: './',
      entries: ['./lib/cli-engine.js']
    })

    should.exist(result)
    result.should.have.nested.property('package.name', 'dependency-check')
    result.should.have.nested.property('package.bin').which.deep.equals({
      'dependency-check': 'cli.cjs'
    })
    result.should.have.property('used').which.includes('meow')
  })

  it('should handle path simply set to "package.json"', async () => {
    const result = await check({
      path: 'package.json',
    })

    should.exist(result)
    result.should.have.nested.property('package.name', 'dependency-check')
  })

  it('should throw when file has no detective', async () => {
    await check({
      path: process.cwd(),
      noDefaultEntries: true,
      entries: ['readme.md']
    })
      .should.be.rejectedWith(Error, `Detective function missing for "${process.cwd() + sep}readme.md"`)
  })

  it('should throw when encountering local file that does not exist', async () => {
    await check({
      path: 'test/mock-missing-local-file/'
    })
      .should.be.rejectedWith(Error, `Cannot find module '${process.cwd() + sep}test${sep}mock-missing-local-file${sep}not-found.js' from '${process.cwd() + sep}test${sep}mock-missing-local-file'`)
  })
})
