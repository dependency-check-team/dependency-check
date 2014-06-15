# dependency-check

checks which modules you have used in your code and then makes sure they are listed as dependencies in your package.json

![dat](http://img.shields.io/badge/Development%20sponsored%20by-dat-green.svg?style=flat)

## how it works

`dependency-check` parses your module code starting from the entry (e.g. `index.js`) and traverses through all relatively required JS files, ultimately producing a list of non-relative modules

* **relative** - e.g. `require('./a-relative-file.js')`, if one of these are encountered the required file will be recursively parsed by the `dependency-check` algorithm
* **non-relative** - e.g. `require('a-module')`, if one of these are encountered it will get added to the list of dependencies, but subdependencies of the module will not get recursively parsed

the goal of this module is to simply check that all non-relative modules that get `require()`'d are in package.json, which prevents people from getting 'module not found' errors when they install your module that has missing deps which was accidentally published to NPM (happened to me all the time, hence the impetus to write this module).

## usage

```js
npm install dependency-check -g
dependency-check <package.json file or module folder path>
```

`dependency-check` will exit with code 1 if there are missing dependencies, in addition to printing them out

## auto check before every npm publish

add this to your `.bash_profile`/`.bashrc`

```sh
# https://gist.github.com/mafintosh/405048d304fbabb830b2
npm () {
  if [ "$1" = "publish" ]; then
    dependency-check . &&  $(which npm) "$*"
  else
    $(which npm) "$*"
  fi
}
```

now when you do `npm publish` and you have missing dependencies it won't publish, e.g.:

```
$ npm publish
Dependencies not listed in package.json: siblings
$ npm install --save siblings
$ npm publish # works this time
```
