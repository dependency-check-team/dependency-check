'use strict'

/** @returns {import('read-pkg').NormalizedPackageJson} */
const mockPkg = () => ({
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
})

const mockUsed = () => ([
  'async',
  'resolve',
  '@scope/test1',
  '@scope/test2',
  'minimist',
])

/** @returns {import('read-pkg').NormalizedPackageJson} */
const mockDevPeerPkg = () => ({
  '_id': 'test@0.0.1',
  'dependencies': {
    '@scope/test1': '*',
  },
  'devDependencies': {
    '@scope/test2': '*',
    'async': '*',
  },
  'peerDependencies': {
    'minimist': '*',
    'resolve': '*',
  },
  'name': 'test',
  'readme': 'ERROR: No README data found!',
  'version': '0.0.1',
})

module.exports = {
  mockPkg,
  mockUsed,
  mockDevPeerPkg
}
