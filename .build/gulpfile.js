const { src, dest } = require('gulp')
const path = require('path')
const babel = require('gulp-babel')

const babelConfig = require('./babel.config.js')

src(path.resolve(__dirname, '../src/**/*.js'))
  .pipe(
    babel(babelConfig)
  )
  .pipe(
    dest(path.resolve(__dirname, '..'))
  )

src(path.resolve(__dirname, '../src/**/*.ts'))
  .pipe(
    dest(path.resolve(__dirname, '..'))
  )
