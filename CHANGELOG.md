# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.3.0-beta.4](https://github.com/dagatsoin/ravioli/compare/v1.3.0-beta.3...v1.3.0-beta.4) (2022-07-06)

## [1.3.0-beta.3](https://github.com/dagatsoin/ravioli/compare/v1.3.0-beta.2...v1.3.0-beta.3) (2022-07-06)

## [1.3.0-beta.2](https://github.com/dagatsoin/ravioli/compare/v1.3.0-beta.1...v1.3.0-beta.2) (2022-07-06)


### Bug Fixes

* reactivity ([b3e48a6](https://github.com/dagatsoin/ravioli/commit/b3e48a62b53d933fbb7a995c98fb3ef81592c06f))
* step nonce is not update ([43d60f1](https://github.com/dagatsoin/ravioli/commit/43d60f1ef87bb872f5dabfe51b52200774ca8d74))

## [1.3.0-beta.1](https://github.com/dagatsoin/ravioli/compare/v1.2.4...v1.3.0-beta.1) (2022-07-05)


### Features

* container is now instanciable ([2bc3328](https://github.com/dagatsoin/ravioli/commit/2bc3328937c5f6d758a472797fdd56b95f376d87))
* mutation condition receices the model data ([0f28632](https://github.com/dagatsoin/ravioli/commit/0f2863211dfa3b5bcb14def924a88165f8f1e799))
* transformer now has access to control states ([7daf32e](https://github.com/dagatsoin/ravioli/commit/7daf32e1b9a8dc800960ba2660d920c34e01d7c0))

## [1.2.4](https://github.com/dagatsoin/ravioli/compare/v1.2.3...v1.2.4) (2020-04-06)

**Note:** Version bump only for package ravioli





## [1.2.3](https://github.com/dagatsoin/ravioli/compare/v1.2.2...v1.2.3) (2020-04-06)


### Bug Fixes

* **ravioli:** action shortcut ([f4b8556](https://github.com/dagatsoin/ravioli/commit/f4b85569398d8e3f3c47372d10b3cb21c6edac88))





## [1.2.2](https://github.com/dagatsoin/ravioli/compare/v1.2.1...v1.2.2) (2020-04-06)


### Bug Fixes

* **crafter:** computeds read notification in cross context ([33767c8](https://github.com/dagatsoin/ravioli/commit/33767c879b42cd97aa3561ab9ae221563d6d2f5e))
* **crafter-react:** fix test suite startup ([84d29df](https://github.com/dagatsoin/ravioli/commit/84d29df1f4983a7ea01b38f3a0acc2d47dd204c7))





## [1.2.1](https://github.com/dagatsoin/ravioli/compare/v1.2.0...v1.2.1) (2020-04-02)


### Bug Fixes

* **ravioli:** bump crafter version ([e2349b3](https://github.com/dagatsoin/ravioli/commit/e2349b38e0db40c2ff7ace5f32edd26981835a25))





# 1.2.0 (2020-04-02)


### Bug Fixes

* boxed representation reactivity ([aaeb152](https://github.com/dagatsoin/ravioli/commit/aaeb15202ed1e96a028d89d1ee4cc08b0394fb05))
* **ravioli:** fix lint erros due to previous enabled strict mode ([1af9383](https://github.com/dagatsoin/ravioli/commit/1af93834d1071bf7fe15f3eb2b4972781bbbb81d))
* non explicit imports ([cc3d670](https://github.com/dagatsoin/ravioli/commit/cc3d67078a01c0432de848a5817e5d3a1f768dfc))


### Code Refactoring

* rename crafter package to @warfog/crafter ([06701b0](https://github.com/dagatsoin/ravioli/commit/06701b0564357d9b518ee19878c4ac4a992e2ce5))


### Features

* **example:** Add a RPG example ([8685d2b](https://github.com/dagatsoin/ravioli/commit/8685d2b99c053a52bcdcee9c71de2d3493920ad1))
* **ravioli:** Pass state in stepReaction effect ([50d2908](https://github.com/dagatsoin/ravioli/commit/50d290838c1f351338b139ae36e39cccdb80f998))
* **ravioli:** Support non observable representation ([16b247f](https://github.com/dagatsoin/ravioli/commit/16b247f6f26b789ce925aeed32441962d5cc339c))


### BREAKING CHANGES

* `ComputedOptions.isObservable` becomes `ComputedOptions.isBoxed` and their value must be reversed (false -> true)
* `createTransfomer` 2nd argument is true when value object will be boxed
* renamed package crafter to @warfog/crafter





# [1.1.0](https://github.com/dagatsoin/ravioli/compare/v1.0.0...v1.1.0) (2020-03-31)


### Bug Fixes

* **ravioli:** fix lint erros due to previous enabled strict mode ([1af9383](https://github.com/dagatsoin/ravioli/commit/1af93834d1071bf7fe15f3eb2b4972781bbbb81d))


### Features

* **ravioli:** Pass state in stepReaction effect ([50d2908](https://github.com/dagatsoin/ravioli/commit/50d290838c1f351338b139ae36e39cccdb80f998))
* **ravioli:** Support non observable representation ([16b247f](https://github.com/dagatsoin/ravioli/commit/16b247f6f26b789ce925aeed32441962d5cc339c))





# 1.0.0 (2020-03-30)


### Bug Fixes

* non explicit imports ([cc3d670](https://github.com/dagatsoin/ravioli/commit/cc3d67078a01c0432de848a5817e5d3a1f768dfc))


### Code Refactoring

* rename crafter package to @warfog/crafter ([06701b0](https://github.com/dagatsoin/ravioli/commit/06701b0564357d9b518ee19878c4ac4a992e2ce5))


### Features

* **example:** Add a RPG example ([8685d2b](https://github.com/dagatsoin/ravioli/commit/8685d2b99c053a52bcdcee9c71de2d3493920ad1))


### BREAKING CHANGES

* renamed package crafter to @warfog/crafter
