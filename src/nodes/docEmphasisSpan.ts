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

/**
 * Constructor parameters for {@link DocEmphasisSpan}.
 */
export interface DocEmphasisSpanParameters extends IDocNodeContainerParameters {
  bold?: boolean;
  italic?: boolean;
}

/**
 * Represents a span of text that is styled with CommonMark emphasis (italics), strong emphasis (boldface),
 * or both.
 */
export class DocEmphasisSpan extends DocNodeContainer {
  readonly bold: boolean;
  readonly italic: boolean;

  constructor(parameters: DocEmphasisSpanParameters, children?: DocNode[]) {
    super(parameters, children);
    this.bold = !!parameters.bold;
    this.italic = !!parameters.italic;
  }

  /** @override */
  get kind(): string {
    return CustomDocNodeKind.EmphasisSpan;
  }
}
