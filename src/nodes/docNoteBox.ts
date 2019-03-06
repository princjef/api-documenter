/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocNode, DocSection, IDocNodeParameters } from '@microsoft/tsdoc';

import { CustomDocNodeKind } from './customDocNodeKind';

/**
 * Constructor parameters for {@link DocNoteBox}.
 */
export interface DocNoteBoxParameters extends IDocNodeParameters {}

/**
 * Represents a note box, which is typically displayed as a bordered box containing informational text.
 */
export class DocNoteBox extends DocNode {
  readonly content: DocSection;

  constructor(
    parameters: DocNoteBoxParameters,
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
    return CustomDocNodeKind.NoteBox;
  }

  /** @override */
  protected onGetChildNodes(): ReadonlyArray<DocNode | undefined> {
    return [this.content];
  }
}
