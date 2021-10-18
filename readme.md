# dependency-check

checks which modules you have used in your code and then makes sure they are listed as dependencies in your package.json, or vice-versa

![Node CI](https://github.com/dependency-check-team/dependency-check/workflows/Node%20CI/badge.svg)
![Static code analysis](https://github.com/dependency-check-team/dependency-check/workflows/Static%20code%20analysis/badge.svg)
[![dependencies Status](https://david-dm.org/dependency-check-team/dependency-check/status.svg)](https://david-dm.org/dependency-check-team/dependency-check)
[![Known Vulnerabilities](https://snyk.io/test/github/dependency-check-team/dependency-check/badge.svg?targetFile=package.json)](https://snyk.io/test/github/dependency-check-team/dependency-check?targetFile=package.json)

[![js-standard-style](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)

## requirements for maintained majors

dependency-check `5.x` supports Node.js 12 and later

dependency-check `4.x` supports Node.js 10 and later

dependency-check `3.x` supports Node.js 6 and later

dependency-check `2.x` supports Node.js 0.10 and later (Dev note: published using the `legacy` tag)

For more info on maintenance status, see [SECURITY.md](./SECURITY.md).

## how it works

`dependency-check` parses your module code starting from the default entry files (e.g. `index.js` or `main` and any `bin` commands defined in package.json or if specific files has been defined, then those) and traverses through all relatively required JS files, ultimately producing a list of non-relative modules

* **relative** - e.g. `require('./a-relative-file.js')`, if one of these are encountered the required file will be recursively parsed by the `dependency-check` algorithm
* **non-relative** - e.g. `require('a-module')`, if one of these are encountered it will get added to the list of dependencies, but sub-dependencies of the module will not get recursively parsed

the goal of this module is to simply check that all non-relative modules that get `require()`'d are in package.json, which prevents people from getting 'module not found' errors when they install your module that has missing deps which was accidentally published to NPM (happened to me all the time, hence the impetus to write this module).

## cli usage

```
$ npm install dependency-check -g
$ dependency-check <path to module file(s), package.json or module folder>

# e.g.

$ dependency-check ./package.json --verbose
Success! All dependencies used in the code are listed in package.json
Success! All dependencies in package.json are used in the code
$ dependency-check ./package.json --missing --verbose
Success! All dependencies used in the code are listed in package.json
$ dependency-check ./package.json --unused --verbose
Success! All dependencies in package.json are used in the code

# or with file input instead:

$ dependency-check ./index.js

# even with globs and multiple inputs:

$ dependency-check ./test/**/*.js ./lib/*.js
```

`dependency-check` exits with code 1 if there are discrepancies, in addition to printing them out

To always exit with code 0 pass `--ignore`

### --missing

running `dependency-check ./package.json --missing` will only do the check to make sure that all modules in your code are listed in your package.json

### --unused

running `dependency-check ./package.json --unused` will only do the inverse of the missing check and will tell you which modules in your package.json dependencies **were not used** in your code

### --no-dev

running `dependency-check ./package.json --unused --no-dev` will not tell you if any devDependencies in your package.json were missing or unused

### --no-peer

running `dependency-check ./package.json --unused --no-peer` will not tell you if any peerDependencies in your package.json were missing or unused

### --ignore-module, -i

ignores a module. This works for both `--unused` and `--missing`. You can specify as many separate `--ignore-module` arguments as you want. For example running `dependency-check ./package.json --unused --ignore-module foo` will not tell you if the `foo` module was not used in your code.  Supports globbing patterns through the use of [micromatch](https://www.npmjs.com/package/micromatch), so eg. `--ignore-module "@types/*" is possible`

### --no-default-entries

running eg. `dependency-check package.json tests.js --no-default-entries` won't add any default entries despite the main path given being one to a package.json or module folder. So only the `tests.js` file will be checked

### --extensions, -e

running `dependency-check ./package.json -e js,cjs:detective` will resolve require paths to `.js` and `.cjs` paths, and parse using [`detective`](https://www.npmjs.com/package/detective). Specifying any extension will disable the default detectives. Specify just `-e js,cjs` to use the standard detective, `-e foo::` to use ignore the extension, `-e js:precinct/es6` to specify a specific `precinct` setting

### --detective

running `dependency-check ./package.json --detective detective` will `require()` the local `detective` as the default parser. This can be set per-extension using using `-e`. Defaults to parsing with [`precinct`](https://www.npmjs.com/package/precinct).

### --json, -j

formats the output as a json object

### --verbose

running with `--verbose` will enable a log message on success, otherwise dependency-check only logs on failure.

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

- [detective](https://www.npmjs.org/package/detective)-style packages are used for parsing `require()` statements, which means it only does **static requires**. this means you should convert things like `var foo = "bar"; require(foo)` to be static, e.g. `require("bar")`
- use globbing to effectively add all the files you want to check
