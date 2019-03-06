/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  ApiItem,
  ApiModel,
  IResolveDeclarationReferenceResult
} from '@microsoft/api-extractor-model';
import { DocLinkTag, DocNode } from '@microsoft/tsdoc';

import { CustomDocNodeKind } from '../nodes/customDocNodeKind';
import { DocAnchor } from '../nodes/docAnchor';
import { DocEmphasisSpan } from '../nodes/docEmphasisSpan';
import { DocHeading } from '../nodes/docHeading';
import { DocList } from '../nodes/docList';
import { DocNoteBox } from '../nodes/docNoteBox';
import { DocTable } from '../nodes/docTable';
import { DocTableCell } from '../nodes/docTableCell';
import { IndentedWriter } from '../utils/indentedWriter';

import {
  MarkdownEmitter,
  MarkdownEmitterContext,
  MarkdownEmitterOptions
} from './markdownEmitter';

export interface CustomMarkdownEmitterOptions extends MarkdownEmitterOptions {
  contextApiItem: ApiItem | undefined;

  onGetFilenameForApiItem(apiItem: ApiItem): string | undefined;
}

export class CustomMarkdownEmitter extends MarkdownEmitter {
  private _apiModel: ApiModel;

  constructor(apiModel: ApiModel) {
    super();

    this._apiModel = apiModel;
  }

  /** @override */
  protected writeNode(
    docNode: DocNode,
    context: MarkdownEmitterContext,
    hasNextSibling: boolean
  ): void {
    const writer: IndentedWriter = context.writer;

    switch (docNode.kind) {
      case CustomDocNodeKind.Anchor: {
        const docAnchor: DocAnchor = docNode as DocAnchor;
        writer.ensureSkippedLine();
        writer.writeLine(`<a id="${docAnchor.id}"></a>`);
        writer.writeLine();
        break;
      }
      case CustomDocNodeKind.Heading: {
        const docHeading: DocHeading = docNode as DocHeading;
        writer.ensureSkippedLine();

        let prefix: string;
        switch (docHeading.level) {
          case 1:
            prefix = '#';
            break;
          case 2:
            prefix = '##';
            break;
          case 3:
            prefix = '###';
            break;
          default:
            prefix = '####';
        }

        writer.writeLine(`${prefix} ${this.getEscapedText(docHeading.title)}`);
        writer.writeLine();
        break;
      }
      case CustomDocNodeKind.List: {
        const docList = docNode as DocList;
        context.listLevel += 1;

        if (context.listLevel === 1) {
          writer.ensureSkippedLine();
        }

        for (const node of docList.nodes) {
          if (node.kind === CustomDocNodeKind.List) {
            this.writeNode(node, context, false);
          } else {
            writer.ensureNewLine();
            writer.write('  '.repeat((context.listLevel - 1) * 2) + '- ');
            this.writeNode(node, context, false);
          }
        }

        context.listLevel -= 1;

        if (context.listLevel === 1) {
          writer.ensureSkippedLine();
        }
        break;
      }
      case CustomDocNodeKind.NoteBox: {
        const docNoteBox: DocNoteBox = docNode as DocNoteBox;
        writer.ensureNewLine();

        writer.increaseIndent('> ');

        this.writeNode(docNoteBox.content, context, false);
        writer.ensureNewLine();

        writer.decreaseIndent();

        writer.writeLine();
        break;
      }
      case CustomDocNodeKind.Table: {
        const docTable: DocTable = docNode as DocTable;
        // GitHub's markdown renderer chokes on tables that don't have a blank line above them,
        // whereas VS Code's renderer is totally fine with it.
        writer.ensureSkippedLine();

        context.insideTable = true;

        // Markdown table rows can have inconsistent cell counts.  Size the table based on the longest row.
        let columnCount: number = 0;
        if (docTable.header) {
          columnCount = docTable.header.cells.length;
        }
        for (const row of docTable.rows) {
          if (row.cells.length > columnCount) {
            columnCount = row.cells.length;
          }
        }

        // write the table header (which is required by Markdown)
        writer.write('| ');
        for (let i: number = 0; i < columnCount; i += 1) {
          writer.write(' ');
          if (docTable.header) {
            const cell: DocTableCell | undefined = docTable.header.cells[i];
            if (cell) {
              this.writeNode(cell.content, context, false);
            }
          }
          writer.write(' |');
        }
        writer.writeLine();

        // write the divider
        writer.write('| ');
        for (let i: number = 0; i < columnCount; i += 1) {
          writer.write(' --- |');
        }
        writer.writeLine();

        for (const row of docTable.rows) {
          writer.write('| ');
          for (const cell of row.cells) {
            writer.write(' ');
            this.writeNode(cell.content, context, false);
            writer.write(' |');
          }
          writer.writeLine();
        }
        writer.writeLine();

        context.insideTable = false;

        break;
      }
      case CustomDocNodeKind.EmphasisSpan: {
        const docEmphasisSpan: DocEmphasisSpan = docNode as DocEmphasisSpan;

        if (docEmphasisSpan.bold) {
          writer.write('<b>');
        }
        if (docEmphasisSpan.italic) {
          writer.write('<i>');
        }

        this.writeNodes(docEmphasisSpan.nodes, context);

        if (docEmphasisSpan.italic) {
          writer.write('</i>');
        }
        if (docEmphasisSpan.bold) {
          writer.write('</b>');
        }

        break;
      }
      default:
        super.writeNode(docNode, context, hasNextSibling);
    }
  }

  /** @override */
  protected writeLinkTagWithCodeDestination(
    docLinkTag: DocLinkTag,
    context: MarkdownEmitterContext<CustomMarkdownEmitterOptions>
  ): void {
    const options: CustomMarkdownEmitterOptions = context.options;

    const result: IResolveDeclarationReferenceResult = this._apiModel.resolveDeclarationReference(
      docLinkTag.codeDestination!,
      options.contextApiItem
    );

    if (result.resolvedApiItem) {
      const filename: string | undefined = options.onGetFilenameForApiItem(
        result.resolvedApiItem
      );

      if (filename) {
        let linkText: string = docLinkTag.linkText || '';
        if (linkText.length === 0) {
          // Generate a name such as Namespace1.Namespace2.MyClass.myMethod()
          linkText = result.resolvedApiItem.getScopedNameWithinPackage();
        }
        if (linkText.length > 0) {
          const encodedLinkText: string = this.getEscapedText(
            linkText.replace(/\s+/g, ' ')
          );

          context.writer.write('[');
          context.writer.write(encodedLinkText);
          context.writer.write(`](${filename})`);
        } else {
          console.log('WARNING: Unable to determine link text');
        }
      }
    } else if (result.errorMessage) {
      console.log(
        'WARNING: Unable to resolve reference: ' + result.errorMessage
      );
    }
  }
}
