# dependency-check

checks which modules you have used in your code and then makes sure they are listed as dependencies in your package.json

![dat](http://img.shields.io/badge/Development%20sponsored%20by-dat-green.svg?style=flat)

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
