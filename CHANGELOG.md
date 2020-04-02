# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

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
