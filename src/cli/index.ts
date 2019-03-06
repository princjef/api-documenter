/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from 'path';

import { ApiModel } from '@microsoft/api-extractor-model';
import { Command, flags } from '@oclif/command';
import * as fs from 'fs-extra';

import { MarkdownDocumenter } from '../documenters/markdownDocumenter';

class ApiDocumenterCommand extends Command {
  static description =
    'Reads *.api.json files produced by api-extractor and generates API documentation in various output formats.';

  static flags = {
    input: flags.string({
      char: 'i',
      description:
        'Specifies the input folder containing the *.api.json files to be processed',
      default: './input'
    }),
    output: flags.string({
      char: 'o',
      description:
        'Specifies the output folder where the documentation will be written. ANY EXISTING CONTENTS WILL BE DELETED!',
      default: './markdown'
    })
  };

  async run() {
    const { flags } = this.parse(ApiDocumenterCommand);

    const apiModel = new ApiModel();

    await fs.emptyDir(flags.output!);

    for (const filename of await fs.readdir(flags.input!)) {
      if (filename.match(/\.api\.json$/i)) {
        const filenamePath = path.join(flags.input!, filename);
        apiModel.loadPackage(filenamePath);
      }
    }

    const markdownDocumenter = new MarkdownDocumenter(apiModel);
    markdownDocumenter.generateFiles(flags.output!);
  }
}

export = ApiDocumenterCommand;
