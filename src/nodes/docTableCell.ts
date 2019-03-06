/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocNode, DocSection, IDocNodeParameters } from '@microsoft/tsdoc';

import { CustomDocNodeKind } from './customDocNodeKind';

/**
 * Constructor parameters for {@link DocTableCell}.
 */
export interface DocTableCellParameters extends IDocNodeParameters {}

/**
 * Represents table cell, similar to an HTML `<td>` element.
 */
export class DocTableCell extends DocNode {
  readonly content: DocSection;

  constructor(
    parameters: DocTableCellParameters,
    sectionChildNodes?: ReadonlyArray<DocNode>
  ) {
    super(parameters);

    this.content = new DocSection(
      { configuration: this.configuration },
      sectionChildNodes
    );
  }

  /** @override */
  get kind(): string {
    return CustomDocNodeKind.TableCell;
  }
}
