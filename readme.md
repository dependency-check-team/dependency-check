# dependency-check

checks which modules you have used in your code and then makes sure they are listed as dependencies in your package.json, or vice-versa

[![dat](http://img.shields.io/badge/Development%20sponsored%20by-dat-green.svg?style=flat)](http://dat-data.com/)
[![Build Status](https://travis-ci.org/maxogden/dependency-check.svg?branch=master)](https://travis-ci.org/maxogden/dependency-check)

[![js-standard-style](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)

## requirements

dependency-check `3.x` supports Node.js 6 and later

## how it works

`dependency-check` parses your module code starting from the default entry files (e.g. `index.js` or `main` and any `bin` commands defined in package.json) and traverses through all relatively required JS files, ultimately producing a list of non-relative modules

* **relative** - e.g. `require('./a-relative-file.js')`, if one of these are encountered the required file will be recursively parsed by the `dependency-check` algorithm
* **non-relative** - e.g. `require('a-module')`, if one of these are encountered it will get added to the list of dependencies, but subdependencies of the module will not get recursively parsed

the goal of this module is to simply check that all non-relative modules that get `require()`'d are in package.json, which prevents people from getting 'module not found' errors when they install your module that has missing deps which was accidentally published to NPM (happened to me all the time, hence the impetus to write this module).

## cli usage

```
$ npm install dependency-check -g
$ dependency-check <package.json file or module folder path>

# e.g.

$ dependency-check ./package.json
Success! All dependencies used in the code are listed in package.json
$ dependency-check ./package.json --unused
Success! All dependencies in package.json are used in the code
```

`dependency-check` exits with code 1 if there are discrepancies, in addition to printing them out

To always exit with code 0 pass `--ignore`

### --missing (default)

running `dependency-check ./package.json` will check to make sure that all modules in your code are listed in your package.json

### --unused, --extra

running `dependency-check ./package.json --unused` will do the inverse of the default missing check and will tell you which modules in your package.json dependencies **were not used** in your code

### --no-dev

running `dependency-check ./package.json --unused --no-dev` will not tell you if any devDependencies in your package.json were missing or unused

### --no-peer

running `dependency-check ./package.json --unused --no-peer` will not tell you if any peerDependencies in your package.json were missing or unused

### --ignore-module, -i

running `dependency-check ./package.json --unused --ignore-module foo` will not tell you if the `foo` module was not used in your code. You can specify as many separate `--ignore-module` arguments as you want

### --entry

by default your `main` and `bin` entries from package.json will be parsed, but you can add more the list of entries by passing them in as `--entry`, e.g.:

```
dependency-check package.json --entry tests.js
```

in the above example `tests.js` will get added to the entries that get parsed + checked in addition to the defaults. You can specify as many separate `--entry` arguments as you want

you can also instead add additional entries directly after your package definition, like:

```
dependency-check package.json tests.js
```

### --no-default-entries

running `dependency-check package.json --no-default-entries --entry tests.js` won't parse any entries other than `tests.js`.  None of the entries from your package.json `main` and `bin` will be parsed

### --extensions, -e

running `dependency-check ./package.json -e js,jsx:precinct` will resolve require paths to `.js` and `.jsx` paths, and parse using [`precinct`](https://www.npmjs.com/package/precinct).

### --detective

running `dependency-check ./package.json --detective precinct` will `require()` the local `precinct` as the default parser. This can be set per-extension using using `-e`. Defaults to parsing with [`detective`](https://www.npmjs.com/package/detective).

### --quiet

Running with `--quiet` will diable the default log message on success, so that dependency-check only logs on failure.

### --help

shows above options and all other available options

## auto check before every npm publish

add this to your `.bash_profile`/`.bashrc`

```sh
# originally from https://gist.github.com/mafintosh/405048d304fbabb830b2
npm () {
  ([ "$1" != "publish" ] || dependency-check .) && command npm "$@"
}
```

now when you do `npm publish` and you have missing dependencies it won't publish, e.g.:

```
$ npm publish
Fail! Dependencies not listed in package.json: siblings
$ npm install --save siblings
$ npm publish # works this time
```

## grunt usage

See [grunt-dependency-check](https://github.com/sindresorhus/grunt-dependency-check).

## protips

- [detective](https://www.npmjs.org/package/detective) is used for parsing `require()` statements, which means it only does **static requires**. this means you should convert things like `var foo = "bar"; require(foo)` to be static, e.g. `require("bar")`
- you can specify as many entry points as you like with multiple `--entry foo.js` arguments
