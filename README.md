# @princjef/api-documenter

[![Build Status](https://dev.azure.com/princjef/github-ci/_apis/build/status/princjef.api-documenter?branchName=master)](https://dev.azure.com/princjef/github-ci/_build/latest?definitionId=6&branchName=master)
[![npm version](https://img.shields.io/npm/v/@princjef/api-documenter.svg)](https://npmjs.org/package/@princjef/api-documenter)

Automatic documentation of public APIs for Typescript packages.

This package is forked from [`@microsoft/api-documenter`][api documenter] and is
meant to be used alongside [`@microsoft/api-extractor`][api extractor]. It has
been updated with the following adjustments/capabilities:

- Nested folder structure to more easily understand API structure and support
  [declaration merging][]
- Includes class and interface hierarchies with links to parent/child classes
  and interfaces
- Inlines class/interface members with deep linking to reduce amount of
  navigation needed
- Overrides automatically inherit documentation of superclass/interface members
  that are documented
- Inlines inherited members for classes and interfaces to make the full contract
  viewable in one place
- Fixes up the navigation breadcrumb to make the package entry point the
  homepage, rather than asusming that there will be multiple packages present

## Usage

To use this package, you will typically want to install it alongside the [API
Extractor][] tool:

```
npm install --save-dev @microsoft/api-extractor @princjef/api-documenter
```

To get API Extractor to work with the documenter, you will need an
`api-extractor.json` file like the following in your repository:

```json
{
  "compiler": {
    "configType": "tsconfig",
    "rootFolder": "."
  },
  "project": {
    "entryPointSourceFile": "<your built .d.ts entry point>"
  },
  "apiJsonFile": {
    "enabled": true,
    "outputFolder": "./temp"
  }
}
```

With the configuration above, you can then generate your documentation by
running:

```
api-extractor run && api-documenter --input ./temp --output <output folder>
```

Running this will output markdown files for your API to the folder specified.
You can either use these output files directly or integrate it with a
documentation site of your choosing.

## Frequenetly Asked Questions

**What documentation tags can I use?**

This package relies on a slightly modified version of JSDoc comments called
[AEDoc][]. Work is ongoing to standardize this into a [TSDoc][] specification.

**Why am I seeing an error about a missing release tag?**

[API Extractor][] requires all exported items (classes, interfaces, types,
namespaces, etc.), to be labeled with one of the four visibility filters
(`@public`, `@beta`, `@alpha`, `@internal`) to make the usage explicit. If you
want to get rid of the warning and include the item as a regular exported
member, add the `@public` tag on its own line at the end of the doc comment for
the item.

## Contributing

See [CONTRIBUTING.md][contributing] for full contribution guidelines.

[aedoc]: https://api-extractor.com/pages/tsdoc/syntax/
[tsdoc]: https://github.com/Microsoft/tsdoc
[api extractor]: https://api-extractor.com/
[api documenter]:
  https://github.com/Microsoft/web-build-tools/tree/master/apps/api-documenter
[declaration merging]:
  https://www.typescriptlang.org/docs/handbook/declaration-merging.html
[contributing]: ./CONTRIBUTING.md
