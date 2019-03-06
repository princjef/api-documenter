/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocNode, DocPlainText, IDocNodeParameters } from '@microsoft/tsdoc';

import { CustomDocNodeKind } from './customDocNodeKind';
import { DocTableCell } from './docTableCell';

/**
 * Constructor parameters for {@link DocTableRow}.
 */
export interface DocTableRowParameters extends IDocNodeParameters {}

/**
 * Represents table row, similar to an HTML `<tr>` element.
 */
export class DocTableRow extends DocNode {
  private readonly _cells: DocTableCell[];

  constructor(
    parameters: DocTableRowParameters,
    cells?: ReadonlyArray<DocTableCell>
  ) {
    super(parameters);

    this._cells = [];
    if (cells) {
      for (const cell of cells) {
        this.addCell(cell);
      }
    }
  }

  /** @override */
  get kind(): string {
    return CustomDocNodeKind.TableRow;
  }

  get cells(): ReadonlyArray<DocTableCell> {
    return this._cells;
  }

  addCell(cell: DocTableCell): void {
    this._cells.push(cell);
  }

  createAndAddCell(): DocTableCell {
    const newCell: DocTableCell = new DocTableCell({
      configuration: this.configuration
    });
    this.addCell(newCell);
    return newCell;
  }

  addPlainTextCell(cellContent: string): DocTableCell {
    const cell: DocTableCell = this.createAndAddCell();
    cell.content.appendNodeInParagraph(
      new DocPlainText({
        configuration: this.configuration,
        text: cellContent
      })
    );
    return cell;
  }

  /** @override */
  protected onGetChildNodes(): ReadonlyArray<DocNode | undefined> {
    return this._cells;
  }
}
