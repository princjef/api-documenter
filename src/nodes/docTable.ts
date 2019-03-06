/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocNode, IDocNodeParameters } from '@microsoft/tsdoc';

import { CustomDocNodeKind } from './customDocNodeKind';
import { DocTableCell } from './docTableCell';
import { DocTableRow } from './docTableRow';

/**
 * Constructor parameters for {@link DocTable}.
 */
export interface DocTableParameters extends IDocNodeParameters {
  headerCells?: ReadonlyArray<DocTableCell>;
  headerTitles?: string[];
}

/**
 * Represents table, similar to an HTML `<table>` element.
 */
export class DocTable extends DocNode {
  readonly header: DocTableRow;

  private _rows: DocTableRow[];

  constructor(
    parameters: DocTableParameters,
    rows?: ReadonlyArray<DocTableRow>
  ) {
    super(parameters);

    this.header = new DocTableRow({ configuration: this.configuration });
    this._rows = [];

    if (parameters) {
      if (parameters.headerTitles) {
        if (parameters.headerCells) {
          throw new Error(
            'IDocTableParameters.headerCells and IDocTableParameters.headerTitles' +
              ' cannot both be specified'
          );
        }
        for (const cellText of parameters.headerTitles) {
          this.header.addPlainTextCell(cellText);
        }
      } else if (parameters.headerCells) {
        for (const cell of parameters.headerCells) {
          this.header.addCell(cell);
        }
      }
    }

    if (rows) {
      for (const row of rows) {
        this.addRow(row);
      }
    }
  }

  /** @override */
  get kind(): string {
    return CustomDocNodeKind.Table;
  }

  get rows(): ReadonlyArray<DocTableRow> {
    return this._rows;
  }

  addRow(row: DocTableRow): void {
    this._rows.push(row);
  }

  createAndAddRow(): DocTableRow {
    const row: DocTableRow = new DocTableRow({
      configuration: this.configuration
    });
    this.addRow(row);
    return row;
  }

  /** @override */
  protected onGetChildNodes(): ReadonlyArray<DocNode | undefined> {
    return [this.header, ...this._rows];
  }
}
