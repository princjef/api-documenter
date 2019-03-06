/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  DocCodeSpan,
  DocErrorText,
  DocEscapedText,
  DocFencedCode,
  DocHtmlEndTag,
  DocHtmlStartTag,
  DocLinkTag,
  DocNode,
  DocNodeKind,
  DocNodeTransforms,
  DocParagraph,
  DocPlainText,
  DocSection,
  StringBuilder
} from '@microsoft/tsdoc';

import { IndentedWriter } from '../utils/indentedWriter';

export interface MarkdownEmitterOptions {}

export interface MarkdownEmitterContext<TOptions = MarkdownEmitterOptions> {
  writer: IndentedWriter;
  insideTable: boolean;

  writingBold: boolean;
  writingItalic: boolean;

  listLevel: number;

  options: TOptions;
}

/**
 * Renders MarkupElement content in the Markdown file format.
 * For more info:  https://en.wikipedia.org/wiki/Markdown
 */
export class MarkdownEmitter {
  emit(
    stringBuilder: StringBuilder,
    docNode: DocNode,
    options: MarkdownEmitterOptions
  ): string {
    const writer: IndentedWriter = new IndentedWriter(stringBuilder);

    const context: MarkdownEmitterContext = {
      writer,
      insideTable: false,

      writingBold: false,
      writingItalic: false,

      listLevel: 0,

      options
    };

    this.writeNode(docNode, context, false);

    writer.ensureNewLine(); // finish the last line

    return writer.toString();
  }

  protected getEscapedText(text: string): string {
    return text
      .replace(/\\/g, '\\\\') // first replace the escape character
      .replace(/[*#[\]_|`~]/g, x => '\\' + x) // then escape any special characters
      .replace(/---/g, '\\-\\-\\-') // hyphens only if it's 3 or more
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * @virtual
   */
  protected writeNode(
    docNode: DocNode,
    context: MarkdownEmitterContext,
    hasNextSibling: boolean
  ): void {
    const writer: IndentedWriter = context.writer;

    switch (docNode.kind) {
      case DocNodeKind.PlainText: {
        const docPlainText: DocPlainText = docNode as DocPlainText;
        this.writePlainText(docPlainText.text, context);
        break;
      }
      case DocNodeKind.HtmlStartTag:
      case DocNodeKind.HtmlEndTag: {
        const docHtmlTag: DocHtmlStartTag | DocHtmlEndTag = docNode as
          | DocHtmlStartTag
          | DocHtmlEndTag;
        // write the HTML element verbatim into the output
        writer.write(docHtmlTag.emitAsHtml());
        break;
      }
      case DocNodeKind.CodeSpan: {
        const docCodeSpan: DocCodeSpan = docNode as DocCodeSpan;
        if (context.insideTable) {
          const parts = docCodeSpan.code.replace(/\|/g, '\\|').split(/\r?\n/g);
          if (parts.length > 1) {
            writer.write(`<pre>${parts.join('&#010;')}</pre>`);
          } else {
            writer.write(`\`${docCodeSpan.code.replace(/\|/g, '\\|')}\``);
          }
        } else {
          writer.write(`\`${docCodeSpan.code}\``);
        }
        break;
      }
      case DocNodeKind.LinkTag: {
        const docLinkTag: DocLinkTag = docNode as DocLinkTag;
        if (docLinkTag.codeDestination) {
          this.writeLinkTagWithCodeDestination(docLinkTag, context);
        } else if (docLinkTag.urlDestination) {
          this.writeLinkTagWithUrlDestination(docLinkTag, context);
        } else if (docLinkTag.linkText) {
          this.writePlainText(docLinkTag.linkText, context);
        }
        break;
      }
      case DocNodeKind.Paragraph: {
        const docParagraph: DocParagraph = docNode as DocParagraph;
        const trimmedParagraph: DocParagraph = DocNodeTransforms.trimSpacesInParagraph(
          docParagraph
        );
        if (context.insideTable) {
          this.writeNodes(trimmedParagraph.nodes, context);

          // Special case:  If we have another element inside this table cell,
          // then we need to put some space between them
          if (hasNextSibling) {
            writer.write('<br><br>');
          }
        } else {
          this.writeNodes(trimmedParagraph.nodes, context);
          writer.ensureNewLine();
          writer.writeLine();
        }
        break;
      }
      case DocNodeKind.FencedCode: {
        const docFencedCode: DocFencedCode = docNode as DocFencedCode;
        if (context.insideTable) {
          const parts = docFencedCode.code
            .replace(/\|/g, '\\|')
            .split(/\r?\n/g);
          const lang = docFencedCode.language;
          writer.write(`<pre lang="${lang}">${parts.join('&#010;')}</pre>`);
        } else {
          writer.ensureNewLine();
          writer.write('```');
          writer.write(docFencedCode.language);
          writer.writeLine();
          writer.write(docFencedCode.code);
          writer.writeLine();
          writer.writeLine('```');
        }
        break;
      }
      case DocNodeKind.Section: {
        const docSection: DocSection = docNode as DocSection;
        this.writeNodes(docSection.nodes, context);
        break;
      }
      case DocNodeKind.SoftBreak: {
        if (!/^\s?$/.test(writer.peekLastCharacter())) {
          writer.write(' ');
        }
        break;
      }
      case DocNodeKind.EscapedText: {
        const docEscapedText: DocEscapedText = docNode as DocEscapedText;
        this.writePlainText(docEscapedText.decodedText, context);
        break;
      }
      case DocNodeKind.ErrorText: {
        const docErrorText: DocErrorText = docNode as DocErrorText;
        this.writePlainText(docErrorText.text, context);
        break;
      }
      case DocNodeKind.InlineTag: {
        break;
      }
      default:
        throw new Error('Unsupported element kind: ' + docNode.kind);
    }
  }

  /** @virtual */
  protected writeLinkTagWithCodeDestination(
    docLinkTag: DocLinkTag,
    context: MarkdownEmitterContext
  ): void {
    // The subclass needs to implement this to support code destinations
    throw new Error('not implemented');
  }

  /** @virtual */
  protected writeLinkTagWithUrlDestination(
    docLinkTag: DocLinkTag,
    context: MarkdownEmitterContext
  ): void {
    const linkText: string =
      docLinkTag.linkText !== undefined
        ? docLinkTag.linkText
        : docLinkTag.urlDestination!;

    const encodedLinkText: string = this.getEscapedText(
      linkText.replace(/\s+/g, ' ')
    );

    context.writer.write('[');
    context.writer.write(encodedLinkText);
    context.writer.write(`](${docLinkTag.urlDestination!})`);
  }

  protected writePlainText(
    text: string,
    context: MarkdownEmitterContext
  ): void {
    const writer: IndentedWriter = context.writer;

    // split out the [ leading whitespace, content, trailing whitespace ]
    const parts: string[] = text.match(/^(\s*)(.*?)(\s*)$/) || [];

    writer.write(parts[1]); // write leading whitespace

    const middle: string = parts[2];

    if (middle !== '') {
      switch (writer.peekLastCharacter()) {
        case '':
        case '\n':
        case ' ':
        case '[':
        case '>':
          // okay to put a symbol
          break;
        default:
          // This is no problem:        "**one** *two* **three**"
          // But this is trouble:       "**one***two***three**"
          // The most general solution: "**one**<!-- -->*two*<!-- -->**three**"
          writer.write('<!-- -->');
          break;
      }

      writer.write(this.getEscapedText(middle));
    }

    writer.write(parts[3]); // write trailing whitespace
  }

  protected writeNodes(
    docNodes: ReadonlyArray<DocNode>,
    context: MarkdownEmitterContext
  ): void {
    for (const [index, docNode] of docNodes.entries()) {
      this.writeNode(docNode, context, index < docNodes.length - 1);
    }
  }
}
