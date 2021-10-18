'use strict'

const { check } = require('./lib/check')
const { extra, missing } = require('./lib/compare')

module.exports = {
  check,
  extra,
  missing,
}
