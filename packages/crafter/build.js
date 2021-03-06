const rollup = require('rollup');
const typescript = require('@rollup/plugin-typescript');
const uglify = require("rollup-plugin-uglify").uglify;

function getConfig(target) {
  return {
    inputOptions: {
      input: `src/index.ts`,
      plugins: [
        typescript({
          tsconfig: "tsconfig.build.json"
        })
      ]
    },
    outputOptions: target === 'browser'
      ? {
        file: 'dist/index.browser.js',
        format: 'iife',
        name: '$crafter',
        sourcemap: 'inline',
        plugins: [
          uglify()
        ]
      }
      : {
        dir: 'dist',
        format: 'cjs',
        sourcemap: 'inline',
        plugins: [
          uglify()
        ]
      }
  }
}

async function build(config) {
  // create a bundle
  const bundle = await rollup.rollup(config.inputOptions);

  // generate code
  await bundle.generate(config.outputOptions);

  // or write the bundle to disk
  await bundle.write(config.outputOptions);
}

build(getConfig('module'))
build(getConfig('browser'))
