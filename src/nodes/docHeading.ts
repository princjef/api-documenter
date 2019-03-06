/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocNode, IDocNodeParameters } from '@microsoft/tsdoc';

import { CustomDocNodeKind } from './customDocNodeKind';

/**
 * Constructor parameters for {@link DocHeading}.
 */
export interface DocHeadingParameters extends IDocNodeParameters {
  title: string;
  level?: number;
}

/**
 * Represents a section header similar to an HTML `<h1>` or `<h2>` element.
 */
export class DocHeading extends DocNode {
  readonly title: string;
  readonly level: number;

  /**
   * Don't call this directly.  Instead use {@link TSDocParser}
   * @internal
   */
  constructor(parameters: DocHeadingParameters) {
    super(parameters);
    this.title = parameters.title;
    this.level = parameters.level !== undefined ? parameters.level : 1;

    if (this.level < 1 || this.level > 5) {
      throw new Error(
        'IDocHeadingParameters.level must be a number between 1 and 5'
      );
    }
  }

  /** @override */
  get kind(): string {
    return CustomDocNodeKind.Heading;
  }
}
