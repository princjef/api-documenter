/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  DocNode,
  DocNodeContainer,
  IDocNodeContainerParameters
} from '@microsoft/tsdoc';

import { CustomDocNodeKind } from './customDocNodeKind';

export interface DocListParameters extends IDocNodeContainerParameters {}

export class DocList extends DocNodeContainer {
  constructor(parameters: DocListParameters, children?: DocNode[]) {
    super(parameters, children);
  }

  /** @override */
  get kind(): string {
    return CustomDocNodeKind.List;
  }
}
