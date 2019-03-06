/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from 'path';

import {
  ApiClass,
  ApiDeclaredItem,
  ApiDocumentedItem,
  ApiEnum,
  ApiInterface,
  ApiItem,
  ApiItemKind,
  ApiModel,
  ApiNamespace,
  ApiPackage,
  ApiParameterListMixin,
  ApiPropertyItem,
  ApiReleaseTagMixin,
  ApiReturnTypeMixin,
  ApiStaticMixin,
  Excerpt,
  Parameter,
  ReleaseTag
} from '@microsoft/api-extractor-model';
import {
  DocBlock,
  DocCodeSpan,
  DocComment,
  DocFencedCode,
  DocLinkTag,
  DocNodeKind,
  DocParagraph,
  DocPlainText,
  DocSection,
  StandardTags,
  StringBuilder,
  TSDocConfiguration
} from '@microsoft/tsdoc';
import * as fs from 'fs-extra';
import * as ts from 'typescript';

import { CustomMarkdownEmitter } from '../markdown/customMarkdownEmitter';
import { configuration } from '../nodes/customDocNodeKind';
import { DocAnchor } from '../nodes/docAnchor';
import { DocEmphasisSpan } from '../nodes/docEmphasisSpan';
import { DocHeading } from '../nodes/docHeading';
import { DocList } from '../nodes/docList';
import { DocNoteBox } from '../nodes/docNoteBox';
import { DocTable } from '../nodes/docTable';
import { DocTableCell } from '../nodes/docTableCell';
import { DocTableRow } from '../nodes/docTableRow';
import getConciseSignature from '../utils/getConciseSignature';

/**
 * Renders API documentation in the Markdown file format.
 * For more info:  https://en.wikipedia.org/wiki/Markdown
 */
export class MarkdownDocumenter {
  private readonly _apiModel: ApiModel;
  private readonly _tsdocConfiguration: TSDocConfiguration;
  private readonly _markdownEmitter: CustomMarkdownEmitter;
  private _outputFolder!: string;

  constructor(apiModel: ApiModel) {
    this._apiModel = apiModel;
    this._tsdocConfiguration = configuration;
    this._markdownEmitter = new CustomMarkdownEmitter(this._apiModel);
  }

  generateFiles(outputFolder: string): void {
    this._outputFolder = outputFolder;

    console.log();
    this._deleteOldOutputFiles();

    for (const apiPackage of this._apiModel.packages) {
      console.log(`Writing ${apiPackage.name} package`);
      const typeMap = this._generateTypeMapping(apiPackage);
      const inheritanceMap = this._generateClassHierarchy(
        { typeMap },
        apiPackage
      );
      this._writeApiItemPage({ typeMap, inheritanceMap }, apiPackage);
    }
  }

  private _generateTypeMapping(apiPackage: ApiPackage): Map<string, ApiItem> {
    const map: Map<string, ApiItem> = new Map();
    const children: ApiItem[] = [...apiPackage.members];
    while (children.length > 0) {
      const child = children.shift()!;
      switch (child.kind) {
        case ApiItemKind.Class:
        case ApiItemKind.Enum:
        case ApiItemKind.Interface:
        case ApiItemKind.TypeAlias:
          const name = child.getScopedNameWithinPackage();
          if (map.has(name)) {
            console.log(`Duplicate type for ${name}`);
          }
          map.set(name, child);
      }

      children.push(...child.members);
    }

    return map;
  }

  private _generateClassHierarchy(
    context: Pick<Context, 'typeMap'>,
    apiPackage: ApiPackage
  ): Map<ApiItem, Refs> {
    const map: Map<ApiItem, Refs> = new Map();
    const children: ApiItem[] = [...apiPackage.members];
    while (children.length > 0) {
      const child = children.shift()!;
      switch (child.kind) {
        case ApiItemKind.Class:
          {
            const refs: Refs = {
              parentClass: undefined,
              childClasses: [],
              parentInterfaces: [],
              childInterfaces: []
            };
            const parentClass = (child as ApiClass).extendsType;
            if (parentClass) {
              const parentClassText = parentClass.excerpt.text;
              refs.parentClass = this._extractBaseType(
                context,
                child,
                parentClassText
              );
            }

            for (const parentInterface of (child as ApiClass).implementsTypes) {
              const parentInterfaceText = parentInterface.excerpt.text;
              const resolvedBaseInterface = this._extractBaseType(
                context,
                child,
                parentInterfaceText
              );
              if (resolvedBaseInterface) {
                refs.parentInterfaces.push(resolvedBaseInterface);
              }
            }

            map.set(child, refs);
          }

          break;
        case ApiItemKind.Interface: {
          const refs: Refs = {
            childClasses: [],
            parentInterfaces: [],
            childInterfaces: []
          };
          for (const parentInterface of (child as ApiInterface).extendsTypes) {
            const parentInterfaceText = parentInterface.excerpt.text;
            const resolvedBaseInterface = this._extractBaseType(
              context,
              child,
              parentInterfaceText
            );
            if (resolvedBaseInterface) {
              refs.parentInterfaces.push(resolvedBaseInterface);
            }
          }

          map.set(child, refs);
        }
      }

      children.push(...child.members);
    }

    // Now that we've figured out everyone's parent classes, we build the
    // reverse pointers to the child classes/interfaces to make documentation
    // emitting easier.
    for (const [child, { parentClass, parentInterfaces }] of map) {
      if (parentClass instanceof ApiItem) {
        const refs: Refs = map.get(parentClass) || {
          childClasses: [],
          parentInterfaces: [],
          childInterfaces: []
        };

        refs.childInterfaces.push(child);

        map.set(parentClass, refs);
      }

      for (const parentInterface of parentInterfaces) {
        if (!(parentInterface instanceof ApiItem)) {
          continue;
        }

        const refs: Refs = map.get(parentInterface) || {
          childClasses: [],
          parentInterfaces: [],
          childInterfaces: []
        };

        if (child.kind === ApiItemKind.Class) {
          refs.childClasses.push(child);
        } else {
          refs.childInterfaces.push(child);
        }

        map.set(parentInterface, refs);
      }
    }

    return map;
  }

  private _writeApiItemPage(
    baseContext: Pick<Context, 'typeMap' | 'inheritanceMap'>,
    apiItem: ApiItem
  ): void {
    const configuration: TSDocConfiguration = this._tsdocConfiguration;
    const output: DocSection = new DocSection({
      configuration: this._tsdocConfiguration
    });
    const filepath = this._getFilenameForApiItem(apiItem);
    const filename: string = path.join(this._outputFolder, filepath);
    const context: Context = { ...baseContext, filename: filepath, level: 1 };

    this._writeBreadcrumb(context, output, apiItem);

    const scopedName: string = apiItem.getScopedNameWithinPackage();

    switch (apiItem.kind) {
      case ApiItemKind.Class:
        output.appendNode(
          new DocHeading({
            configuration,
            title: `Class ${scopedName}`,
            level: context.level
          })
        );
        break;
      case ApiItemKind.Enum:
        output.appendNode(
          new DocHeading({
            configuration,
            title: `Enum ${scopedName}`,
            level: context.level
          })
        );
        break;
      case ApiItemKind.Interface:
        output.appendNode(
          new DocHeading({
            configuration,
            title: `Interface ${scopedName}`,
            level: context.level
          })
        );
        break;
      case ApiItemKind.Method:
      case ApiItemKind.MethodSignature:
        output.appendNode(
          new DocHeading({
            configuration,
            title: `Method ${scopedName}`,
            level: context.level
          })
        );
        break;
      case ApiItemKind.Function:
        output.appendNode(
          new DocHeading({
            configuration,
            title: `Function ${scopedName}`,
            level: context.level
          })
        );
        break;
      case ApiItemKind.Namespace:
        output.appendNode(
          new DocHeading({
            configuration,
            title: `Namespace ${scopedName}`,
            level: context.level
          })
        );
        break;
      case ApiItemKind.Package:
        output.appendNode(
          new DocHeading({
            configuration,
            title: apiItem.displayName,
            level: context.level
          })
        );
        break;
      case ApiItemKind.Property:
      case ApiItemKind.PropertySignature:
        output.appendNode(
          new DocHeading({
            configuration,
            title: `Property ${scopedName}`,
            level: context.level
          })
        );
        break;
      case ApiItemKind.TypeAlias:
        output.appendNode(
          new DocHeading({
            configuration,
            title: `Type ${scopedName}`,
            level: context.level
          })
        );
        break;
      case ApiItemKind.Variable:
        output.appendNode(
          new DocHeading({
            configuration,
            title: `Variable ${scopedName}`,
            level: context.level
          })
        );
        break;
      default:
        throw new Error('Unsupported API item kind: ' + apiItem.kind);
    }

    this._appendSection(output, this._writeApiItemBody(context, apiItem));

    const stringBuilder: StringBuilder = new StringBuilder();

    this._markdownEmitter.emit(stringBuilder, output, {
      contextApiItem: apiItem,
      onGetFilenameForApiItem: (apiItemForFilename: ApiItem) => {
        return this._getLinkFilenameForApiItem(context, apiItemForFilename);
      }
    });

    fs.mkdirpSync(path.dirname(filename));
    fs.writeFileSync(filename, stringBuilder.toString());
  }

  private _writeApiItemBody(
    context: Context,
    apiItem: ApiItem,
    parents?: ApiItem[]
  ) {
    const configuration: TSDocConfiguration = this._tsdocConfiguration;
    const output = new DocSection({ configuration });
    if (ApiReleaseTagMixin.isBaseClassOf(apiItem)) {
      if (apiItem.releaseTag === ReleaseTag.Beta) {
        this._writeBetaWarning(output);
      }
    }

    if (apiItem instanceof ApiDocumentedItem) {
      const tsdocComment: DocComment | undefined = apiItem.tsdocComment;

      if (tsdocComment) {
        if (tsdocComment.deprecatedBlock) {
          output.appendNode(
            new DocNoteBox({ configuration: this._tsdocConfiguration }, [
              new DocParagraph({ configuration: this._tsdocConfiguration }, [
                new DocPlainText({
                  configuration: this._tsdocConfiguration,
                  text: 'Warning: This API is now obsolete. '
                })
              ]),
              ...tsdocComment.deprecatedBlock.content.nodes
            ])
          );
        }
      }
    }

    for (const item of [apiItem, ...(parents || [])]) {
      if (item instanceof ApiDocumentedItem) {
        const tsdocComment: DocComment | undefined = item.tsdocComment;

        if (tsdocComment && tsdocComment.summarySection.nodes.length > 0) {
          this._appendSection(output, tsdocComment.summarySection);
          break;
        }
      }
    }

    const inheritanceNote = this._createInheritanceNote(
      context,
      apiItem,
      parents || []
    );
    if (inheritanceNote) {
      output.appendNode(inheritanceNote);
    }

    for (const item of [apiItem, ...(parents || [])]) {
      if (item instanceof ApiDocumentedItem) {
        const tsdocComment: DocComment | undefined = item.tsdocComment;

        if (tsdocComment && tsdocComment.remarksBlock) {
          this._appendSection(output, tsdocComment.remarksBlock.content);
          break;
        }
      }
    }

    if (apiItem instanceof ApiDeclaredItem) {
      if (apiItem.excerpt.text.length > 0) {
        output.appendNode(
          new DocParagraph({ configuration }, [
            new DocEmphasisSpan({ configuration, bold: true }, [
              new DocPlainText({ configuration, text: 'Signature:' })
            ])
          ])
        );
        output.appendNode(
          new DocFencedCode({
            configuration,
            code: this._getSignature(apiItem),
            language: 'typescript'
          })
        );
      }
    }

    for (const item of [apiItem, ...(parents || [])]) {
      if (item instanceof ApiDocumentedItem) {
        const tsdocComment: DocComment | undefined = item.tsdocComment;

        if (tsdocComment) {
          const defaultValueBlock = tsdocComment.customBlocks.find(
            x =>
              x.blockTag.tagNameWithUpperCase ===
              StandardTags.defaultValue.tagNameWithUpperCase
          );

          if (defaultValueBlock) {
            const header = new DocEmphasisSpan({ configuration, bold: true }, [
              new DocPlainText({ configuration, text: 'Default Value:' })
            ]);

            const firstNode = defaultValueBlock.content.nodes[0];
            if (
              defaultValueBlock.content.nodes.length === 1 &&
              firstNode instanceof DocParagraph
            ) {
              output.appendNode(
                new DocParagraph({ configuration }, [
                  header,
                  ...firstNode.nodes
                ])
              );
            } else {
              output.appendNode(new DocParagraph({ configuration }, [header]));

              this._appendSection(output, defaultValueBlock.content);
            }

            break;
          }
        }
      }
    }

    if (apiItem.kind === ApiItemKind.Class) {
      this._writeClassHierarchy(context, output, apiItem);
      this._writeInterfaceImplementations(context, output, apiItem);
    }

    if (apiItem.kind === ApiItemKind.Interface) {
      this._writeInterfaceImplementations(context, output, apiItem);
      this._writeInterfaceImplementors(context, output, apiItem);
    }

    if (apiItem instanceof ApiDocumentedItem) {
      const tsdocComment: DocComment | undefined = apiItem.tsdocComment;

      if (tsdocComment) {
        // Write the @example blocks
        const exampleBlocks: DocBlock[] = tsdocComment.customBlocks.filter(
          x =>
            x.blockTag.tagNameWithUpperCase ===
            StandardTags.example.tagNameWithUpperCase
        );

        let exampleNumber: number = 1;
        for (const exampleBlock of exampleBlocks) {
          const heading: string =
            exampleBlocks.length > 1 ? `Example ${exampleNumber}` : 'Example';

          output.appendNode(
            new DocHeading({
              configuration: this._tsdocConfiguration,
              title: heading,
              level: context.level + 1
            })
          );

          this._appendSection(output, exampleBlock.content);

          exampleNumber += 1;
        }
      }
    }

    switch (apiItem.kind) {
      case ApiItemKind.Class:
        this._writeClassTables(context, output, apiItem as ApiClass);
        break;
      case ApiItemKind.Enum:
        this._writeEnumTables(context, output, apiItem as ApiEnum);
        break;
      case ApiItemKind.Interface:
        this._writeInterfaceTables(context, output, apiItem as ApiInterface);
        break;
      case ApiItemKind.Method:
      case ApiItemKind.MethodSignature:
      case ApiItemKind.Function:
        this._writeParameterTables(
          context,
          output,
          apiItem as ApiParameterListMixin
        );
        break;
      case ApiItemKind.Namespace:
        this._writePackageOrNamespaceTables(
          context,
          output,
          apiItem as ApiNamespace
        );
        break;
      case ApiItemKind.Package:
        this._writePackageOrNamespaceTables(
          context,
          output,
          apiItem as ApiPackage
        );
        break;
      case ApiItemKind.Property:
      case ApiItemKind.PropertySignature:
        break;
      case ApiItemKind.TypeAlias:
        break;
      case ApiItemKind.Variable:
        break;
      default:
        throw new Error('Unsupported API item kind: ' + apiItem.kind);
    }

    return output;
  }

  private _writeClassHierarchy(
    context: Context,
    output: DocSection,
    apiItem: ApiItem
  ): void {
    const configuration = this._tsdocConfiguration;

    const refs = context.inheritanceMap.get(apiItem);
    if (!refs) {
      return;
    }

    // Walk to children first, then parent
    const childTree = this._generateChildTree(context, apiItem, 'childClasses');
    const tree = refs.parentClass
      ? this._generateParentTree(context, refs.parentClass, childTree)
      : childTree;

    // Don't render an empty tree
    if (tree.children.length === 0) {
      return;
    }

    output.appendNode(
      new DocHeading({
        configuration,
        title: 'Class Hierarchy',
        level: context.level + 1
      })
    );

    output.appendNode(this._createTypeTree(context, apiItem, [tree]));
  }

  private _writeInterfaceImplementations(
    context: Context,
    output: DocSection,
    apiItem: ApiItem
  ): void {
    const configuration = this._tsdocConfiguration;

    const refs = context.inheritanceMap.get(apiItem);
    if (!refs) {
      return;
    }

    const tree = this._generateChildTree(context, apiItem, 'parentInterfaces');
    if (tree.children.length === 0) {
      return;
    }

    output.appendNode(
      new DocHeading({
        configuration,
        title: 'Implements Interfaces',
        level: context.level + 1
      })
    );

    output.appendNode(this._createTypeTree(context, apiItem, [tree]));
  }

  private _writeInterfaceImplementors(
    context: Context,
    output: DocSection,
    apiItem: ApiItem
  ): void {
    const configuration = this._tsdocConfiguration;

    const refs = context.inheritanceMap.get(apiItem);
    if (!refs) {
      return;
    }

    const tree = this._generateChildTree(context, apiItem, 'childInterfaces');
    if (tree.children.length === 0) {
      return;
    }

    output.appendNode(
      new DocHeading({
        configuration,
        title: 'Implemented By',
        level: context.level + 1
      })
    );

    output.appendNode(this._createTypeTree(context, apiItem, [tree]));
  }

  private _createInheritanceNote(
    context: Context,
    apiItem: ApiItem,
    inheritanceChain: ApiItem[]
  ): DocParagraph | undefined {
    // If the inheritance chain is empty, there's nothing to do here
    if (inheritanceChain.length === 0) {
      return undefined;
    }

    const parent = inheritanceChain[0];

    let text: string;
    if (apiItem === parent) {
      // If the item is in the chain, then the item was inherited
      text = 'Inherited from ';
    } else if (
      (apiItem.kind === ApiItemKind.Method ||
        parent.kind === ApiItemKind.Property) &&
      (apiItem.kind === ApiItemKind.MethodSignature ||
        parent.kind === ApiItemKind.PropertySignature)
    ) {
      // If the item is an implementation and the parent is not, then it's an
      // implementation of the parent
      text = 'Implements ';
    } else {
      // Otherwise, either the signature is overridden or the implementation is
      // overridden
      text = 'Overrides ';
    }

    return new DocParagraph({ configuration: this._tsdocConfiguration }, [
      new DocEmphasisSpan(
        { configuration: this._tsdocConfiguration, italic: true },
        [
          new DocPlainText({ configuration: this._tsdocConfiguration, text }),
          new DocLinkTag({
            configuration: this._tsdocConfiguration,
            tagName: '@link',
            linkText: parent.getScopedNameWithinPackage(),
            urlDestination: this._getLinkFilenameForApiItem(context, parent)
          })
        ]
      )
    ]);
  }

  private _getResolvedMembers(
    context: Context,
    apiItem: ApiClass | ApiInterface
  ): ResolvedMember[] {
    // TODO: static and instance are merged
    // TODO: match overloads properly
    const rawInheritedMembers = this._getInheritedMembers(context, apiItem);

    const ownMembers = Array.from(apiItem.members).sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );

    const inheritedMembers = Array.from(rawInheritedMembers)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({
        first: v[0],
        chain: v
      }));

    const resolvedMembers: ResolvedMember[] = [];

    while (ownMembers.length > 0 || inheritedMembers.length > 0) {
      const nextOwnMember = ownMembers[0];
      const nextInheritedMember = inheritedMembers[0];

      const comparison = (nextOwnMember
        ? nextOwnMember.displayName
        : ''
      ).localeCompare(
        nextInheritedMember ? nextInheritedMember.first.displayName : ''
      );

      if (!nextOwnMember || (nextInheritedMember && comparison > 0)) {
        // Inherited member
        resolvedMembers.push({
          parents: nextInheritedMember.chain
        });
        inheritedMembers.shift();
      } else if (!nextInheritedMember || (nextOwnMember && comparison < 0)) {
        // Own member
        resolvedMembers.push({
          ownMember: nextOwnMember,
          parents: []
        });
        ownMembers.shift();
      } else {
        // Both present
        resolvedMembers.push({
          ownMember: nextOwnMember,
          parents: nextInheritedMember.chain
        });
        ownMembers.shift();
        inheritedMembers.shift();
      }
    }

    return resolvedMembers;
  }

  private _getInheritedMembers(
    context: Context,
    apiItem: ApiClass | ApiInterface
  ): Map<string, ApiItem[]> {
    const members: Map<
      string,
      { level: number; alternates: ApiItem[] }[]
    > = new Map();

    const refs = context.inheritanceMap.get(apiItem);

    let level = 1;
    let currentLevel = refs
      ? [
          ...(refs.parentClass ? [refs.parentClass] : []),
          ...refs.parentInterfaces
        ]
      : [];
    let nextLevel: (ApiItem | string)[] = [];

    while (currentLevel.length > 0) {
      const current = currentLevel.shift()!;
      if (typeof current !== 'string') {
        for (const member of current.members) {
          const hierarchy = members.get(member.displayName);
          if (!hierarchy) {
            members.set(member.displayName, [
              {
                level,
                alternates: [member]
              }
            ]);
          } else {
            const lastLevel = hierarchy[hierarchy.length - 1];
            if (lastLevel.level !== level) {
              hierarchy.push({
                level,
                alternates: [member]
              });
            } else {
              lastLevel.alternates.push(member);
            }
          }
        }

        const refs = context.inheritanceMap.get(current);
        if (refs) {
          if (refs.parentClass) {
            nextLevel.push(refs.parentClass);
          }

          nextLevel.push(...refs.parentInterfaces);
        }
      }

      if (currentLevel.length === 0) {
        currentLevel = nextLevel;
        nextLevel = [];
        level += 1;
      }
    }

    return new Map(
      Array.from(members).map<[string, ApiItem[]]>(([k, v]) => [
        k,
        v.reduce(
          (acc, { alternates }) => [...acc, ...alternates],
          [] as ApiItem[]
        )
      ])
    );
  }

  private _createTypeTree(
    context: Context,
    currentApiItem: ApiItem,
    tree: TreeNode[]
  ): DocList {
    return new DocList(
      { configuration: this._tsdocConfiguration },
      tree
        .map(node => {
          const text =
            typeof node.item === 'string'
              ? new DocPlainText({
                  configuration: this._tsdocConfiguration,
                  text: node.item
                })
              : node.item === currentApiItem
              ? new DocEmphasisSpan(
                  {
                    configuration: this._tsdocConfiguration,
                    bold: true
                  },
                  [
                    new DocPlainText({
                      configuration: this._tsdocConfiguration,
                      text: node.item.getScopedNameWithinPackage()
                    })
                  ]
                )
              : new DocLinkTag({
                  configuration: this._tsdocConfiguration,
                  tagName: '@link',
                  linkText: node.item.getScopedNameWithinPackage(),
                  urlDestination: this._getLinkFilenameForApiItem(
                    context,
                    node.item
                  )
                });

          return node.children.length > 0
            ? [
                text,
                this._createTypeTree(context, currentApiItem, node.children)
              ]
            : [text];
        })
        .reduce((acc, val) => [...acc, ...val], [])
    );
  }

  private _generateChildTree(
    context: Context,
    apiItem: ApiItem | string,
    walkKey: 'childClasses' | 'childInterfaces' | 'parentInterfaces'
  ): TreeNode {
    if (typeof apiItem === 'string') {
      return {
        item: apiItem,
        children: []
      };
    }

    const mapEntry = context.inheritanceMap.get(apiItem);

    return {
      item: apiItem,
      children: (mapEntry ? mapEntry[walkKey] : []).map(child =>
        this._generateChildTree(context, child, walkKey)
      )
    };
  }

  private _generateParentTree(
    context: Context,
    apiItem: ApiItem | string,
    childNode: TreeNode
  ): TreeNode {
    if (typeof apiItem === 'string') {
      return {
        item: apiItem,
        children: [childNode]
      };
    }

    const mapEntry = context.inheritanceMap.get(apiItem);

    const children = (mapEntry ? mapEntry.childClasses : []).map(child =>
      child === childNode.item ? childNode : { item: child, children: [] }
    );

    if (mapEntry && mapEntry.parentClass) {
      return this._generateParentTree(context, mapEntry.parentClass, {
        item: apiItem,
        children
      });
    }
    return {
      item: apiItem,
      children
    };
  }

  /**
   * GENERATE PAGE: PACKAGE or NAMESPACE
   */
  private _writePackageOrNamespaceTables(
    context: Context,
    output: DocSection,
    apiContainer: ApiPackage | ApiNamespace
  ): void {
    const configuration: TSDocConfiguration = this._tsdocConfiguration;

    const classesTable: DocTable = new DocTable({
      configuration,
      headerTitles: ['Class', 'Description']
    });

    const enumerationsTable: DocTable = new DocTable({
      configuration,
      headerTitles: ['Enumeration', 'Description']
    });

    const functionsTable: DocTable = new DocTable({
      configuration,
      headerTitles: ['Function', 'Description']
    });

    const interfacesTable: DocTable = new DocTable({
      configuration,
      headerTitles: ['Interface', 'Description']
    });

    const namespacesTable: DocTable = new DocTable({
      configuration,
      headerTitles: ['Namespace', 'Description']
    });

    const variablesTable: DocTable = new DocTable({
      configuration,
      headerTitles: ['Variable', 'Description']
    });

    const typeAliasesTable: DocTable = new DocTable({
      configuration,
      headerTitles: ['Type Alias', 'Description']
    });

    const apiMembers: ReadonlyArray<ApiItem> =
      apiContainer.kind === ApiItemKind.Package
        ? (apiContainer as ApiPackage).entryPoints[0].members
        : (apiContainer as ApiNamespace).members;

    for (const apiMember of apiMembers) {
      const row: DocTableRow = new DocTableRow({ configuration }, [
        this._createTitleCell(context, apiMember),
        this._createDescriptionCell(context, apiMember)
      ]);

      switch (apiMember.kind) {
        case ApiItemKind.Class:
          classesTable.addRow(row);
          this._writeApiItemPage(context, apiMember);
          break;

        case ApiItemKind.Enum:
          enumerationsTable.addRow(row);
          this._writeApiItemPage(context, apiMember);
          break;

        case ApiItemKind.Interface:
          interfacesTable.addRow(row);
          this._writeApiItemPage(context, apiMember);
          break;

        case ApiItemKind.Namespace:
          namespacesTable.addRow(row);
          this._writeApiItemPage(context, apiMember);
          break;

        case ApiItemKind.Function:
          functionsTable.addRow(row);
          this._writeApiItemPage(context, apiMember);
          break;

        case ApiItemKind.TypeAlias:
          typeAliasesTable.addRow(row);
          this._writeApiItemPage(context, apiMember);
          break;

        case ApiItemKind.Variable:
          variablesTable.addRow(row);
          this._writeApiItemPage(context, apiMember);
          break;
      }
    }

    if (classesTable.rows.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration: this._tsdocConfiguration,
          title: 'Classes',
          level: context.level + 1
        })
      );
      output.appendNode(classesTable);
    }

    if (enumerationsTable.rows.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration: this._tsdocConfiguration,
          title: 'Enumerations',
          level: context.level + 1
        })
      );
      output.appendNode(enumerationsTable);
    }

    if (functionsTable.rows.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration: this._tsdocConfiguration,
          title: 'Functions',
          level: context.level + 1
        })
      );
      output.appendNode(functionsTable);
    }

    if (interfacesTable.rows.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration: this._tsdocConfiguration,
          title: 'Interfaces',
          level: context.level + 1
        })
      );
      output.appendNode(interfacesTable);
    }

    if (namespacesTable.rows.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration: this._tsdocConfiguration,
          title: 'Namespaces',
          level: context.level + 1
        })
      );
      output.appendNode(namespacesTable);
    }

    if (variablesTable.rows.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration: this._tsdocConfiguration,
          title: 'Variables',
          level: context.level + 1
        })
      );
      output.appendNode(variablesTable);
    }

    if (typeAliasesTable.rows.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration: this._tsdocConfiguration,
          title: 'Type Aliases',
          level: context.level + 1
        })
      );
      output.appendNode(typeAliasesTable);
    }
  }

  /**
   * GENERATE PAGE: CLASS
   */
  private _writeClassTables(
    context: Context,
    output: DocSection,
    apiClass: ApiClass
  ): void {
    const configuration: TSDocConfiguration = this._tsdocConfiguration;

    const eventsTable: DocTable = new DocTable({
      configuration,
      headerTitles: ['Property', 'Type', 'Description']
    });

    const staticEventsTable: DocTable = new DocTable({
      configuration,
      headerTitles: ['Property', 'Type', 'Description']
    });

    const propertiesTable: DocTable = new DocTable({
      configuration,
      headerTitles: ['Property', 'Type', 'Description']
    });

    const staticPropertiesTable: DocTable = new DocTable({
      configuration,
      headerTitles: ['Property', 'Type', 'Description']
    });

    const methodsTable: DocTable = new DocTable({
      configuration,
      headerTitles: ['Method', 'Description']
    });

    const staticMethodsTable: DocTable = new DocTable({
      configuration,
      headerTitles: ['Method', 'Description']
    });

    const eventsDetails = new DocSection({ configuration });

    const staticEventsDetails = new DocSection({ configuration });

    const propertiesDetails = new DocSection({ configuration });

    const staticPropertiesDetails = new DocSection({ configuration });

    const methodsDetails = new DocSection({ configuration });

    const staticMethodsDetails = new DocSection({ configuration });

    const resolvedMembers = this._getResolvedMembers(context, apiClass);

    for (const resolvedMember of resolvedMembers) {
      const apiMember = resolvedMember.ownMember || resolvedMember.parents[0];
      switch (apiMember.kind) {
        case ApiItemKind.MethodSignature:
        case ApiItemKind.Method: {
          const [table, details] = this._isStatic(apiMember)
            ? [staticMethodsTable, staticMethodsDetails]
            : [methodsTable, methodsDetails];
          table.addRow(
            new DocTableRow({ configuration }, [
              this._createTitleCell(context, apiMember),
              this._createDescriptionCell(
                context,
                apiMember,
                resolvedMember.parents
              )
            ])
          );

          if (apiMember === resolvedMember.ownMember) {
            details.appendNode(
              new DocAnchor({
                configuration,
                id: this._getAnchorForApiItem(apiMember) || ''
              })
            );
            details.appendNode(
              new DocHeading({
                configuration,
                title: getConciseSignature(apiMember),
                level: context.level + 2
              })
            );

            this._appendSection(
              details,
              this._writeApiItemBody(
                {
                  ...context,
                  level: context.level + 2
                },
                apiMember,
                resolvedMember.parents
              )
            );
          }
          break;
        }
        case ApiItemKind.PropertySignature:
        case ApiItemKind.Property: {
          if ((apiMember as ApiPropertyItem).isEventProperty) {
            const [table, details] = this._isStatic(apiMember)
              ? [staticEventsTable, staticEventsDetails]
              : [eventsTable, eventsDetails];
            table.addRow(
              new DocTableRow({ configuration }, [
                this._createTitleCell(context, apiMember),
                this._createPropertyTypeCell(context, apiMember),
                this._createDescriptionCell(
                  context,
                  apiMember,
                  resolvedMember.parents
                )
              ])
            );

            if (apiMember === resolvedMember.ownMember) {
              details.appendNode(
                new DocAnchor({
                  configuration,
                  id: this._getAnchorForApiItem(apiMember) || ''
                })
              );
              details.appendNode(
                new DocHeading({
                  configuration,
                  title: getConciseSignature(apiMember),
                  level: context.level + 2
                })
              );
              this._appendSection(
                details,
                this._writeApiItemBody(
                  {
                    ...context,
                    level: context.level + 2
                  },
                  apiMember,
                  resolvedMember.parents
                )
              );
            }
          } else {
            const [table, details] = this._isStatic(apiMember)
              ? [staticPropertiesTable, staticPropertiesDetails]
              : [propertiesTable, propertiesDetails];
            table.addRow(
              new DocTableRow({ configuration }, [
                this._createTitleCell(context, apiMember),
                this._createPropertyTypeCell(context, apiMember),
                this._createDescriptionCell(
                  context,
                  apiMember,
                  resolvedMember.parents
                )
              ])
            );

            if (apiMember === resolvedMember.ownMember) {
              details.appendNode(
                new DocAnchor({
                  configuration,
                  id: this._getAnchorForApiItem(apiMember) || ''
                })
              );
              details.appendNode(
                new DocHeading({
                  configuration,
                  title: getConciseSignature(apiMember),
                  level: context.level + 2
                })
              );
              this._appendSection(
                details,
                this._writeApiItemBody(
                  {
                    ...context,
                    level: context.level + 2
                  },
                  apiMember,
                  resolvedMember.parents
                )
              );
            }
          }
          break;
        }
      }
    }

    if (staticEventsTable.rows.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration: this._tsdocConfiguration,
          title: 'Static Events',
          level: context.level + 1
        })
      );
      output.appendNode(staticEventsTable);
    }

    if (eventsTable.rows.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration: this._tsdocConfiguration,
          title: 'Events',
          level: context.level + 1
        })
      );
      output.appendNode(eventsTable);
    }

    if (staticPropertiesTable.rows.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration: this._tsdocConfiguration,
          title: 'Static Properties',
          level: context.level + 1
        })
      );
      output.appendNode(staticPropertiesTable);
    }

    if (propertiesTable.rows.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration: this._tsdocConfiguration,
          title: 'Properties',
          level: context.level + 1
        })
      );
      output.appendNode(propertiesTable);
    }

    if (staticMethodsTable.rows.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration: this._tsdocConfiguration,
          title: 'Static Methods',
          level: context.level + 1
        })
      );
      output.appendNode(staticMethodsTable);
    }

    if (methodsTable.rows.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration: this._tsdocConfiguration,
          title: 'Methods',
          level: context.level + 1
        })
      );
      output.appendNode(methodsTable);
    }

    if (staticEventsDetails.nodes.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration,
          title: 'Static Event Details',
          level: context.level + 1
        })
      );
      this._appendSection(output, staticEventsDetails);
    }

    if (eventsDetails.nodes.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration,
          title: 'Event Details',
          level: context.level + 1
        })
      );
      this._appendSection(output, eventsDetails);
    }

    if (staticPropertiesDetails.nodes.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration,
          title: 'Static Property Details',
          level: context.level + 1
        })
      );
      this._appendSection(output, staticPropertiesDetails);
    }

    if (propertiesDetails.nodes.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration,
          title: 'Property Details',
          level: context.level + 1
        })
      );
      this._appendSection(output, propertiesDetails);
    }

    if (staticMethodsDetails.nodes.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration,
          title: 'Static Method Details',
          level: context.level + 1
        })
      );
      this._appendSection(output, staticMethodsDetails);
    }

    if (methodsDetails.nodes.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration,
          title: 'Method Details',
          level: context.level + 1
        })
      );
      this._appendSection(output, methodsDetails);
    }
  }

  /**
   * GENERATE PAGE: ENUM
   */
  private _writeEnumTables(
    context: Context,
    output: DocSection,
    apiEnum: ApiEnum
  ): void {
    const configuration: TSDocConfiguration = this._tsdocConfiguration;

    const enumMembersTable: DocTable = new DocTable({
      configuration,
      headerTitles: ['Member', 'Value', 'Description']
    });

    for (const apiEnumMember of apiEnum.members) {
      enumMembersTable.addRow(
        new DocTableRow({ configuration }, [
          new DocTableCell({ configuration }, [
            new DocParagraph({ configuration }, [
              new DocPlainText({
                configuration,
                text: getConciseSignature(apiEnumMember)
              })
            ])
          ]),

          new DocTableCell({ configuration }, [
            new DocParagraph({ configuration }, [
              new DocCodeSpan({
                configuration,
                code: apiEnumMember.initializerExcerpt.text
              })
            ])
          ]),

          this._createDescriptionCell(context, apiEnumMember)
        ])
      );
    }

    if (enumMembersTable.rows.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration: this._tsdocConfiguration,
          title: 'Enumeration Members',
          level: context.level + 1
        })
      );
      output.appendNode(enumMembersTable);
    }
  }

  /**
   * GENERATE PAGE: INTERFACE
   */
  private _writeInterfaceTables(
    context: Context,
    output: DocSection,
    apiClass: ApiInterface
  ): void {
    const configuration: TSDocConfiguration = this._tsdocConfiguration;

    const eventsTable: DocTable = new DocTable({
      configuration,
      headerTitles: ['Property', 'Type', 'Description']
    });

    const propertiesTable: DocTable = new DocTable({
      configuration,
      headerTitles: ['Property', 'Type', 'Description']
    });

    const methodsTable: DocTable = new DocTable({
      configuration,
      headerTitles: ['Method', 'Description']
    });

    const eventsDetails = new DocSection({ configuration });

    const propertiesDetails = new DocSection({ configuration });

    const methodsDetails = new DocSection({ configuration });

    const resolvedMembers = this._getResolvedMembers(context, apiClass);

    for (const resolvedMember of resolvedMembers) {
      const apiMember = resolvedMember.ownMember || resolvedMember.parents[0];
      switch (apiMember.kind) {
        case ApiItemKind.Method:
        case ApiItemKind.MethodSignature: {
          methodsTable.addRow(
            new DocTableRow({ configuration }, [
              this._createTitleCell(context, apiMember),
              this._createDescriptionCell(
                context,
                apiMember,
                resolvedMember.parents
              )
            ])
          );

          if (apiMember === resolvedMember.ownMember) {
            methodsDetails.appendNode(
              new DocAnchor({
                configuration,
                id: this._getAnchorForApiItem(apiMember) || ''
              })
            );
            methodsDetails.appendNode(
              new DocHeading({
                configuration,
                title: getConciseSignature(apiMember),
                level: context.level + 2
              })
            );
            this._appendSection(
              methodsDetails,
              this._writeApiItemBody(
                {
                  ...context,
                  level: context.level + 2
                },
                apiMember,
                resolvedMember.parents
              )
            );
          }
          break;
        }
        case ApiItemKind.Property:
        case ApiItemKind.PropertySignature: {
          if ((apiMember as ApiPropertyItem).isEventProperty) {
            eventsTable.addRow(
              new DocTableRow({ configuration }, [
                this._createTitleCell(context, apiMember),
                this._createPropertyTypeCell(context, apiMember),
                this._createDescriptionCell(
                  context,
                  apiMember,
                  resolvedMember.parents
                )
              ])
            );

            if (apiMember === resolvedMember.ownMember) {
              eventsDetails.appendNode(
                new DocAnchor({
                  configuration,
                  id: this._getAnchorForApiItem(apiMember) || ''
                })
              );
              eventsDetails.appendNode(
                new DocHeading({
                  configuration,
                  title: getConciseSignature(apiMember),
                  level: context.level + 2
                })
              );
              this._appendSection(
                eventsDetails,
                this._writeApiItemBody(
                  {
                    ...context,
                    level: context.level + 2
                  },
                  apiMember,
                  resolvedMember.parents
                )
              );
            }
          } else {
            propertiesTable.addRow(
              new DocTableRow({ configuration }, [
                this._createTitleCell(context, apiMember),
                this._createPropertyTypeCell(context, apiMember),
                this._createDescriptionCell(
                  context,
                  apiMember,
                  resolvedMember.parents
                )
              ])
            );

            if (apiMember === resolvedMember.ownMember) {
              propertiesDetails.appendNode(
                new DocAnchor({
                  configuration,
                  id: this._getAnchorForApiItem(apiMember) || ''
                })
              );
              propertiesDetails.appendNode(
                new DocHeading({
                  configuration,
                  title: getConciseSignature(apiMember),
                  level: context.level + 2
                })
              );
              this._appendSection(
                propertiesDetails,
                this._writeApiItemBody(
                  {
                    ...context,
                    level: context.level + 2
                  },
                  apiMember,
                  resolvedMember.parents
                )
              );
            }
          }
          break;
        }
      }
    }

    if (eventsTable.rows.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration: this._tsdocConfiguration,
          title: 'Events',
          level: context.level + 1
        })
      );
      output.appendNode(eventsTable);
    }

    if (propertiesTable.rows.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration: this._tsdocConfiguration,
          title: 'Properties',
          level: context.level + 1
        })
      );
      output.appendNode(propertiesTable);
    }

    if (methodsTable.rows.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration: this._tsdocConfiguration,
          title: 'Methods',
          level: context.level + 1
        })
      );
      output.appendNode(methodsTable);
    }

    if (eventsDetails.nodes.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration,
          title: 'Event Details',
          level: context.level + 1
        })
      );
      this._appendSection(output, eventsDetails);
    }

    if (propertiesDetails.nodes.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration,
          title: 'Property Details',
          level: context.level + 1
        })
      );
      this._appendSection(output, propertiesDetails);
    }

    if (methodsDetails.nodes.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration,
          title: 'Method Details',
          level: context.level + 1
        })
      );
      this._appendSection(output, methodsDetails);
    }
  }

  /**
   * GENERATE PAGE: FUNCTION-LIKE
   */
  private _writeParameterTables(
    context: Context,
    output: DocSection,
    apiParameterListMixin: ApiParameterListMixin
  ): void {
    const configuration: TSDocConfiguration = this._tsdocConfiguration;

    const parametersTable: DocTable = new DocTable({
      configuration,
      headerTitles: ['Parameter', 'Type', 'Description']
    });

    for (const apiParameter of apiParameterListMixin.parameters) {
      const parameterDescription: DocSection = new DocSection({
        configuration
      });
      if (apiParameter.tsdocParamBlock) {
        this._appendSection(
          parameterDescription,
          apiParameter.tsdocParamBlock.content
        );
      }

      parametersTable.addRow(
        new DocTableRow({ configuration }, [
          new DocTableCell({ configuration }, [
            new DocParagraph({ configuration }, [
              new DocPlainText({ configuration, text: apiParameter.name })
            ])
          ]),
          this._createParameterTypeCell(
            context,
            apiParameterListMixin,
            apiParameter
          ),
          new DocTableCell({ configuration }, parameterDescription.nodes)
        ])
      );
    }

    if (parametersTable.rows.length > 0) {
      output.appendNode(
        new DocHeading({
          configuration: this._tsdocConfiguration,
          title: 'Parameters',
          level: context.level + 1
        })
      );
      output.appendNode(parametersTable);
    }

    if (ApiReturnTypeMixin.isBaseClassOf(apiParameterListMixin)) {
      const returnTypeExcerpt: Excerpt =
        apiParameterListMixin.returnTypeExcerpt;
      output.appendNode(
        new DocParagraph({ configuration }, [
          new DocEmphasisSpan({ configuration, bold: true }, [
            new DocPlainText({ configuration, text: 'Returns:' })
          ])
        ])
      );

      const returnCode = returnTypeExcerpt.text.trim();
      if (returnCode) {
        output.appendNode(
          new DocParagraph({ configuration }, [
            new DocCodeSpan({ configuration, code: returnCode })
          ])
        );
      } else {
        output.appendNode(
          new DocParagraph({ configuration }, [
            new DocEmphasisSpan({ configuration }, [
              new DocPlainText({ configuration, text: '(not declared)' })
            ])
          ])
        );
      }

      if (apiParameterListMixin instanceof ApiDocumentedItem) {
        if (
          apiParameterListMixin.tsdocComment &&
          apiParameterListMixin.tsdocComment.returnsBlock
        ) {
          this._appendSection(
            output,
            apiParameterListMixin.tsdocComment.returnsBlock.content
          );
        }
      }
    }
  }

  private _createTitleCell(context: Context, apiItem: ApiItem): DocTableCell {
    const configuration: TSDocConfiguration = this._tsdocConfiguration;

    return new DocTableCell({ configuration }, [
      new DocParagraph({ configuration }, [
        new DocLinkTag({
          configuration,
          tagName: '@link',
          linkText: getConciseSignature(apiItem),
          urlDestination: this._getLinkFilenameForApiItem(context, apiItem)
        })
      ])
    ]);
  }

  /**
   * This generates a DocTableCell for an ApiItem including the summary section and "(BETA)" annotation.
   *
   * @remarks
   * We mostly assume that the input is an ApiDocumentedItem, but it's easier to perform this as a runtime
   * check than to have each caller perform a type cast.
   */
  private _createDescriptionCell(
    context: Context,
    apiItem: ApiItem,
    inheritanceChain: ApiItem[] = []
  ): DocTableCell {
    const configuration: TSDocConfiguration = this._tsdocConfiguration;

    const section: DocSection = new DocSection({ configuration });

    if (ApiReleaseTagMixin.isBaseClassOf(apiItem)) {
      if (apiItem.releaseTag === ReleaseTag.Beta) {
        section.appendNodesInParagraph([
          new DocEmphasisSpan({ configuration, bold: true, italic: true }, [
            new DocPlainText({ configuration, text: '(BETA)' })
          ]),
          new DocPlainText({ configuration, text: ' ' })
        ]);
      }
    }

    // Use the summary of the first item in the chain with a summary
    for (const item of [apiItem, ...inheritanceChain]) {
      if (item instanceof ApiDocumentedItem) {
        if (item.tsdocComment !== undefined) {
          this._appendAndMergeSection(
            section,
            item.tsdocComment.summarySection
          );
          break;
        }
      }
    }

    const inherited = this._createInheritanceNote(
      context,
      apiItem,
      inheritanceChain
    );
    if (inherited) {
      section.appendNode(inherited);
    }

    return new DocTableCell({ configuration }, section.nodes);
  }

  private _isStatic(apiItem: ApiItem): boolean {
    return ApiStaticMixin.isBaseClassOf(apiItem) && apiItem.isStatic;
  }

  private _createParameterTypeCell(
    context: Context,
    apiItem: ApiItem,
    parameter: Parameter
  ): DocTableCell {
    const configuration: TSDocConfiguration = this._tsdocConfiguration;

    const section = new DocSection({ configuration });

    const type = this._prettifyCodeBlock(parameter.parameterTypeExcerpt.text);

    const link = this._getLinkForType(context, apiItem, type);
    if (link) {
      section.appendNodeInParagraph(
        new DocLinkTag({
          configuration,
          tagName: '@link',
          linkText: type,
          urlDestination: link
        })
      );
    } else {
      section.appendNodeInParagraph(
        new DocCodeSpan({
          configuration,
          code: type
        })
      );
    }

    return new DocTableCell({ configuration }, section.nodes);
  }

  private _createPropertyTypeCell(
    context: Context,
    apiItem: ApiItem
  ): DocTableCell {
    const configuration: TSDocConfiguration = this._tsdocConfiguration;

    const section = new DocSection({ configuration });

    if (apiItem instanceof ApiPropertyItem) {
      const type = this._prettifyCodeBlock(apiItem.propertyTypeExcerpt.text);

      const link = this._getLinkForType(context, apiItem, type);
      if (link) {
        section.appendNodeInParagraph(
          new DocLinkTag({
            configuration,
            tagName: '@link',
            linkText: type,
            urlDestination: link
          })
        );
      } else {
        section.appendNodeInParagraph(
          new DocCodeSpan({
            configuration,
            code: type
          })
        );
      }
    }

    return new DocTableCell({ configuration }, section.nodes);
  }

  private _prettifyCodeBlock(code: string): string {
    const parts = code.split(/\r?\n/g);
    if (parts.length <= 1) {
      return code.trim();
    }

    // The first line has no indent, but the other lines all do, figure out the
    // smallest shared indent and remove it from all of the lines
    const indent = parts
      .slice(1)
      .reduce(
        (acc, val) => Math.min(acc, val.length - val.trimLeft().length),
        Infinity
      );

    return parts
      .map((part, index) => (index === 0 ? part : part.substring(indent)))
      .join('\n');
  }

  private _getLinkForType(
    context: Context,
    originItem: ApiItem,
    type: string
  ): string | undefined {
    const apiItem = this._resolveType(context, originItem, type);
    return apiItem && this._getLinkFilenameForApiItem(context, apiItem);
  }

  private _resolveType(
    context: Pick<Context, 'typeMap'>,
    originItem: ApiItem,
    type: string
  ): ApiItem | undefined {
    // If this isn't a valid named type, ignore it
    if (!/^[\w_]/.test(type)) {
      return undefined;
    }

    // We reverse the names because closer scopes should be resolved first
    const candidates = new Set(
      originItem
        .getHierarchy()
        .map(apiItem => {
          const itemName = apiItem.getScopedNameWithinPackage();
          return itemName ? `${itemName}.${type}` : type;
        })
        .reverse()
    );

    for (const name of candidates) {
      if (context.typeMap.has(name)) {
        return context.typeMap.get(name);
      }
    }

    return undefined;
  }

  private _writeBreadcrumb(
    context: Context,
    output: DocSection,
    apiItem: ApiItem
  ): void {
    let first = true;
    for (const hierarchyItem of apiItem.getHierarchy()) {
      let tag: DocLinkTag | undefined;

      switch (hierarchyItem.kind) {
        case ApiItemKind.Model:
        case ApiItemKind.EntryPoint:
          // We don't show the model as part of the breadcrumb because it is the root-level container.
          // We don't show the entry point because today API Extractor doesn't support multiple entry points;
          // this may change in the future.
          break;
        case ApiItemKind.Package:
          tag = new DocLinkTag({
            configuration: this._tsdocConfiguration,
            tagName: '@link',
            linkText: 'Home',
            urlDestination: this._getLinkFilenameForApiItem(
              context,
              hierarchyItem
            )
          });
          break;
        default:
          tag = new DocLinkTag({
            configuration: this._tsdocConfiguration,
            tagName: '@link',
            linkText: hierarchyItem.displayName,
            urlDestination: this._getLinkFilenameForApiItem(
              context,
              hierarchyItem
            )
          });
      }

      if (tag) {
        if (!first) {
          output.appendNodeInParagraph(
            new DocPlainText({
              configuration: this._tsdocConfiguration,
              text: ' > '
            })
          );
        }
        first = false;

        output.appendNodeInParagraph(tag);
      }
    }
  }

  private _writeBetaWarning(output: DocSection): void {
    const configuration: TSDocConfiguration = this._tsdocConfiguration;
    const betaWarning: string =
      'This API is provided as a preview for developers and may change' +
      ' based on feedback that we receive.  Do not use this API in a production environment.';
    output.appendNode(
      new DocNoteBox({ configuration }, [
        new DocParagraph({ configuration }, [
          new DocPlainText({ configuration, text: betaWarning })
        ])
      ])
    );
  }

  private _appendSection(output: DocSection, docSection: DocSection): void {
    for (const node of docSection.nodes) {
      output.appendNode(node);
    }
  }

  private _appendAndMergeSection(
    output: DocSection,
    docSection: DocSection
  ): void {
    let firstNode: boolean = true;
    for (const node of docSection.nodes) {
      if (firstNode) {
        if (node.kind === DocNodeKind.Paragraph) {
          output.appendNodesInParagraph(node.getChildNodes());
          firstNode = false;
          continue;
        }
      }
      firstNode = false;

      output.appendNode(node);
    }
  }

  private _getFilenameForApiItem(apiItem: ApiItem): string {
    let baseName: string = '';
    let hashName: string | undefined;
    for (const hierarchyItem of apiItem.getHierarchy()) {
      // For overloaded methods, add a suffix such as "MyClass.myMethod_2".
      let qualifiedName: string = hierarchyItem.displayName;
      if (ApiParameterListMixin.isBaseClassOf(hierarchyItem)) {
        if (hierarchyItem.overloadIndex > 0) {
          qualifiedName += `_${hierarchyItem.overloadIndex}`;
        }
      }

      let folder: string | undefined;
      switch (hierarchyItem.kind) {
        case ApiItemKind.Class:
          folder = 'classes';
          break;
        case ApiItemKind.Enum:
          folder = 'enums';
          break;
        case ApiItemKind.Interface:
          folder = 'interfaces';
          break;
        case ApiItemKind.Namespace:
          folder = 'namespaces';
          break;
        case ApiItemKind.TypeAlias:
          folder = 'types';
          break;
        case ApiItemKind.Variable:
        case ApiItemKind.Function:
          folder = 'variables';
          break;
      }

      switch (hierarchyItem.kind) {
        case ApiItemKind.Model:
        case ApiItemKind.EntryPoint:
        case ApiItemKind.Package:
          break;
        case ApiItemKind.Method:
        case ApiItemKind.MethodSignature:
        case ApiItemKind.Property:
        case ApiItemKind.PropertySignature:
          hashName = this._getAnchorForApiItem(hierarchyItem);
          break;
        default:
          if (baseName) {
            baseName += '/';
          }

          if (folder) {
            baseName += `${folder}/`;
          }

          baseName += qualifiedName;
      }
    }

    let name = (baseName.toLowerCase() || 'index') + '.md';
    if (hashName) {
      name += `#${hashName}`;
    }

    return name;
  }

  private _getAnchorForApiItem(apiItem: ApiItem): string | undefined {
    let anchor: string | undefined;

    switch (apiItem.kind) {
      case ApiItemKind.MethodSignature:
      case ApiItemKind.Method:
        anchor = `${apiItem.displayName}-method`;
        break;
      case ApiItemKind.PropertySignature:
      case ApiItemKind.Property:
        if ((apiItem as ApiPropertyItem).isEventProperty) {
          anchor = `${apiItem.displayName}-event`;
        } else {
          anchor = `${apiItem.displayName}-property`;
        }
        break;
    }

    if (anchor && ApiStaticMixin.isBaseClassOf(apiItem) && apiItem.isStatic) {
      anchor += '-static';
    }

    if (
      anchor &&
      ApiParameterListMixin.isBaseClassOf(apiItem) &&
      apiItem.overloadIndex > 0
    ) {
      anchor += `-${apiItem.overloadIndex}`;
    }

    return anchor;
  }

  private _getLinkFilenameForApiItem(
    context: Context,
    apiItem: ApiItem
  ): string {
    const destination = path.relative(
      path.dirname(context.filename),
      this._getFilenameForApiItem(apiItem)
    );

    if (!destination.startsWith('./') && !destination.startsWith('../')) {
      return `./${destination}`;
    }
    return destination;
  }

  private _deleteOldOutputFiles(): void {
    console.log('Deleting old output from ' + this._outputFolder);
    fs.emptyDirSync(this._outputFolder);
  }

  private _getType(type: string): [ts.TypeNode, ts.SourceFile] {
    const file = ts.createSourceFile(
      'stub.ts',
      `const a:${type}`,
      ts.ScriptTarget.Latest
    );
    return [
      (file.statements[0] as ts.VariableStatement).declarationList
        .declarations[0].type!,
      file
    ];
  }

  private _extractBaseType(
    context: Pick<Context, 'typeMap'>,
    originItem: ApiItem,
    type: string
  ): ApiItem | string | undefined {
    const [typeNode, sourceFile] = this._getType(type);
    if (typeNode.kind === ts.SyntaxKind.TypeReference) {
      const typeText = (typeNode as ts.TypeReferenceNode).typeName.getText(
        sourceFile
      );
      return this._resolveType(context, originItem, typeText) || typeText;
    }

    return undefined;
  }

  private _getSignature(apiItem: ApiDeclaredItem): string {
    // The default excerpt includes tokens like `export` and `default`, which
    // are meaningless in this context
    return apiItem
      .getExcerptWithModifiers()
      .replace(/^export /, '')
      .replace(/^default /, '')
      .replace(/^declare /, '');
  }
}

interface Context {
  typeMap: Map<string, ApiItem>;
  inheritanceMap: Map<ApiItem, Refs>;
  filename: string;
  level: number;
}

interface Refs {
  parentClass?: ApiItem | string;
  childClasses: (ApiItem | string)[];
  parentInterfaces: (ApiItem | string)[];
  childInterfaces: (ApiItem | string)[];
}

interface TreeNode {
  item: ApiItem | string;
  children: TreeNode[];
}

interface ResolvedMember {
  ownMember?: ApiItem;
  parents: ApiItem[];
}
