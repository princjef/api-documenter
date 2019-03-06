/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  ApiItem,
  ApiParameterListMixin,
  Parameter
} from '@microsoft/api-extractor-model';

/**
 * Generates a concise signature for a function.  Example: "getArea(width, height)"
 */
export default function getConciseSignature(apiItem: ApiItem): string {
  if (ApiParameterListMixin.isBaseClassOf(apiItem)) {
    const params = apiItem.parameters.map(getParameter).join(', ');
    return `${apiItem.displayName}(${params})`;
  }
  return apiItem.displayName;
}

function getParameter(parameter: Parameter): string {
  // If the type is a single primitive value, show the type (particularly
  // useful for multiple overloads with things like event emitters)
  if (
    /^'.*'$/.test(parameter.parameterTypeExcerpt.text) ||
    /^".*"$/.test(parameter.parameterTypeExcerpt.text) ||
    /^\d+(\.\d*)?$/.test(parameter.parameterTypeExcerpt.text) ||
    parameter.parameterTypeExcerpt.text === 'true' ||
    parameter.parameterTypeExcerpt.text === 'false' ||
    parameter.parameterTypeExcerpt.text === 'null' ||
    parameter.parameterTypeExcerpt.text === 'undefined'
  ) {
    return `${parameter.name}: ${parameter.parameterTypeExcerpt.text}`;
  }
  return parameter.name;
}
