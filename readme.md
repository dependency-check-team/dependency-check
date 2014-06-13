# dependency-check

checks which modules you have used in your code and then makes sure they are listed as dependencies in your package.json

![dat](http://img.shields.io/badge/Development%20sponsored%20by-dat-green.svg?style=flat)

## usage

```js
npm install dependency-check -g
dependency-check <package.json file or module folder path>
```

`dependency-check` will exit with code 1 if there are missing dependencies, in additiont to printing them out
