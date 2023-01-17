const { src, dest, parallel, series } = require('gulp')
const babel = require('gulp-babel')
const del = require('del')

const babelConfig = require('./babel.config.js')

function clean() {
  return del([
    'angular.ts',
    'angularjs.js',
    'index.js',
    'react.js',
    'vue.js',
  ])
}

function buildJs() {
  return src('src/**/*.js')
    .pipe(babel(babelConfig))
    .pipe(dest('.'))
}

function buildTs() {
  return src('src/**/*.ts')
    .pipe(dest('.'))
}

exports.default = series(
  clean,
  parallel(buildJs, buildTs),
)
