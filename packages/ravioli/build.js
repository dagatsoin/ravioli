const rollup = require('rollup');
const typescript = require('@rollup/plugin-typescript');
const uglify = require("rollup-plugin-uglify").uglify;

function getConfig(target) {
  return {
    inputOptions: {
      input: `src/index.ts`,
      external: [ '@warfog/crafter' ],
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
  let bundle
  try {
     bundle = await rollup.rollup(config.inputOptions);
  } catch (e) {
    console.error(e)
  }

  // generate code
  await bundle.generate(config.outputOptions);

  // or write the bundle to disk
  await bundle.write(config.outputOptions);
}

build(getConfig('module'))
build(getConfig('browser'))
