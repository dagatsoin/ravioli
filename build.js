const rollup = require('rollup');
const typescript = require('@rollup/plugin-typescript');
const uglify = require("rollup-plugin-uglify").uglify;

async function buildModule() {

  const inputOptions = {
    input: 'packages/ravioli/src/index.ts',
    plugins: [
      typescript({
        tsconfig: "tsconfig.build.json"
      })
    ]
  }

  const outputOptions = {
    dir: 'packages/ravioli/dist',
    format: 'cjs',
    sourcemap: 'inline',
    plugins: [
      uglify()
    ]
  }

  // create a bundle
  const bundle = await rollup.rollup(inputOptions);

  // generate code
  await bundle.generate(outputOptions);

  // or write the bundle to disk
  await bundle.write(outputOptions);
}

async function buildBrowser() {

  const inputOptions = {
    input: 'packages/ravioli/src/index.ts',
    plugins: [
      typescript({
        tsconfig: "tsconfig.browser.json",
      })
    ]
  }

  const outputOptions = {
    file: 'packages/ravioli/dist/ravioli.browser.min.js',
    format: 'iife',
    name: "$ravioli",
    sourcemap: 'inline',
    plugins: [
      uglify()
    ]
  }

  // create a bundle
  const bundle = await rollup.rollup(inputOptions);

  // generate code
  await bundle.generate(outputOptions);

  // or write the bundle to disk
  await bundle.write(outputOptions);
}

buildModule();
buildBrowser();