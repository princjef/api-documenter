/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocNodeKind, TSDocConfiguration } from '@microsoft/tsdoc';

import { DocAnchor } from './docAnchor';
import { DocEmphasisSpan } from './docEmphasisSpan';
import { DocHeading } from './docHeading';
import { DocList } from './docList';
import { DocNoteBox } from './docNoteBox';
import { DocTable } from './docTable';
import { DocTableCell } from './docTableCell';
import { DocTableRow } from './docTableRow';

// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Identifies custom subclasses of {@link DocNode}.
 */
export const enum CustomDocNodeKind {
  Anchor = 'Anchor',
  EmphasisSpan = 'EmphasisSpan',
  Heading = 'Heading',
  List = 'List',
  NoteBox = 'NoteBox',
  Table = 'Table',
  TableCell = 'TableCell',
  TableRow = 'TableRow'
}

export const configuration: TSDocConfiguration = new TSDocConfiguration();

configuration.docNodeManager.registerDocNodes('@micrososft/api-documenter', [
  { docNodeKind: CustomDocNodeKind.Anchor, constructor: DocAnchor },
  {
    docNodeKind: CustomDocNodeKind.EmphasisSpan,
    constructor: DocEmphasisSpan
  },
  { docNodeKind: CustomDocNodeKind.Heading, constructor: DocHeading },
  { docNodeKind: CustomDocNodeKind.List, constructor: DocList },
  { docNodeKind: CustomDocNodeKind.NoteBox, constructor: DocNoteBox },
  { docNodeKind: CustomDocNodeKind.Table, constructor: DocTable },
  {
    docNodeKind: CustomDocNodeKind.TableCell,
    constructor: DocTableCell
  },
  { docNodeKind: CustomDocNodeKind.TableRow, constructor: DocTableRow }
]);

configuration.docNodeManager.registerAllowableChildren(
  CustomDocNodeKind.EmphasisSpan,
  [DocNodeKind.LinkTag, DocNodeKind.PlainText, DocNodeKind.SoftBreak]
);

configuration.docNodeManager.registerAllowableChildren(CustomDocNodeKind.List, [
  DocNodeKind.LinkTag,
  DocNodeKind.PlainText,
  CustomDocNodeKind.EmphasisSpan,
  CustomDocNodeKind.List
]);

configuration.docNodeManager.registerAllowableChildren(DocNodeKind.Section, [
  CustomDocNodeKind.Anchor,
  CustomDocNodeKind.Heading,
  CustomDocNodeKind.List,
  CustomDocNodeKind.NoteBox,
  CustomDocNodeKind.Table
]);

configuration.docNodeManager.registerAllowableChildren(DocNodeKind.Paragraph, [
  CustomDocNodeKind.EmphasisSpan,
  CustomDocNodeKind.List
]);
