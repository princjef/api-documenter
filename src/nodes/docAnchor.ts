/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocNode, IDocNodeParameters } from '@microsoft/tsdoc';

import { CustomDocNodeKind } from './customDocNodeKind';

export interface DocAnchorParameters extends IDocNodeParameters {
  id: string;
}

export class DocAnchor extends DocNode {
  readonly id: string;

  constructor(parameters: DocAnchorParameters) {
    super(parameters);

    this.id = parameters.id;
  }

  /** @override */
  get kind(): string {
    return CustomDocNodeKind.Anchor;
  }
}
