import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";

import ts from "typescript";

const desktopRoot = resolve(import.meta.dirname, "..");
const sourceRoot = join(desktopRoot, "src");
const rustSourceRoot = join(desktopRoot, "src-tauri", "src");
const previewFeaturesPath = resolve(desktopRoot, "..", "preview-features.json");

const excludedPathParts = new Set([
  "__fixtures__",
  "__tests__",
  "testing",
  "test-utils",
]);

const excludedFilePatterns = [
  /\.test\.[cm]?[jt]sx?$/,
  /\.spec\.[cm]?[jt]sx?$/,
  /\.stories\.[cm]?[jt]sx?$/,
];

const userFacingPropertyNames =
  /^(?:aria-label|alt|buttonLabel|cancelLabel|confirmLabel|copyLabel|description|detail|emptyMessage|emptyText|errorMessage|headerSubtitle|helperText|hint|inputLabel|label|loadingLabel|message|noResultsText|placeholder|searchPlaceholder|subtitle|successMessage|title|tooltip|warningMessage)$/i;

const nonUserFacingPropertyNames =
  /^(?:className|data-testid|defaultValue|event|feature|href|htmlFor|id|key|kind|method|name|path|rel|role|route|src|testId|type|value|variant)$/i;

const userFacingCallNames =
  /^(?:alert|confirm|prompt|toast|showToast|notify|showNotification|translateCurrentUserVisibleText)$/i;

const userFacingVariableNames =
  /(?:aria|body|caption|confirm|copy|description|detail|empty|error|fallback|helper|hint|label|message|notification|placeholder|status|subtitle|success|text|title|toast|tooltip|warning)/i;

function walkFiles(directory, root = sourceRoot) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const relativePath = relative(root, path);
    const parts = relativePath.split("/");
    if (parts.some((part) => excludedPathParts.has(part))) continue;
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...walkFiles(path, root));
      continue;
    }
    if (![".ts", ".tsx"].includes(extname(entry))) continue;
    if (excludedFilePatterns.some((pattern) => pattern.test(entry))) continue;
    files.push(path);
  }
  return files;
}

function walkRustFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === "tests" || entry === "target") continue;
      files.push(...walkRustFiles(path));
      continue;
    }
    if (extname(entry) !== ".rs") continue;
    if (
      basename(entry).endsWith("_tests.rs") ||
      basename(entry) === "tests.rs"
    ) {
      continue;
    }
    files.push(path);
  }
  return files;
}

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

function looksHumanReadable(value) {
  const normalized = normalize(value);
  const copyWithoutTemplateTokens = normalized.replaceAll("{{value}}", "");
  if (!/[A-Za-z]/.test(copyWithoutTemplateTokens)) return false;
  if (/^(?:https?|wss?|file|tauri|buzz):\/\//i.test(normalized)) return false;
  if (
    /^[a-z0-9_.:/@-]+$/i.test(normalized) &&
    !/^[A-Z][a-z]+$/.test(normalized)
  ) {
    return false;
  }
  if (/^[A-Za-z_][A-Za-z0-9_.-]*=[A-Za-z0-9_.-]+$/.test(normalized)) {
    return false;
  }
  if (/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(normalized)) {
    return false;
  }
  if (
    /^(?:true|false|null|undefined|auto|none|normal|inherit)$/i.test(normalized)
  ) {
    return false;
  }
  return true;
}

function propertyName(node) {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  return null;
}

function callName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) {
    const left = callName(expression.expression);
    return left ? `${left}.${expression.name.text}` : expression.name.text;
  }
  return null;
}

function nearestJsxAttribute(node) {
  let current = node.parent;
  while (current && !ts.isFunctionLike(current)) {
    if (ts.isJsxAttribute(current)) return current;
    current = current.parent;
  }
  return null;
}

function isRenderedInsideJsx(node) {
  let current = node.parent;
  while (current && !ts.isFunctionLike(current)) {
    if (
      ts.isJsxElement(current) ||
      ts.isJsxFragment(current) ||
      ts.isJsxSelfClosingElement(current)
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function enclosingFunctionName(node) {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionLike(current)) {
      if (current.name) return current.name.getText();
      if (
        ts.isVariableDeclaration(current.parent) &&
        ts.isIdentifier(current.parent.name)
      ) {
        return current.parent.name.text;
      }
      return "";
    }
    current = current.parent;
  }
  return "";
}

function enclosingVariableName(node) {
  let current = node.parent;
  while (current) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return current.name.text;
    }
    if (ts.isFunctionLike(current)) return "";
    current = current.parent;
  }
  return "";
}

function contextFor(node) {
  const parent =
    ts.isJsxExpression(node.parent) && node.parent.parent
      ? node.parent.parent
      : node.parent;
  if (!parent) return "literal";
  if (ts.isJsxAttribute(parent)) {
    return `jsx-attribute:${parent.name.getText()}`;
  }
  if (ts.isPropertyAssignment(parent)) {
    return `property:${propertyName(parent.name) ?? parent.name.getText()}`;
  }
  if (ts.isCallExpression(parent)) {
    return `call:${callName(parent.expression) ?? parent.expression.getText()}`;
  }
  if (ts.isConditionalExpression(parent)) return "conditional";
  if (ts.isArrayLiteralExpression(parent)) return "array";
  return ts.SyntaxKind[parent.kind] ?? "literal";
}

function shouldCollectString(node, value) {
  if (!looksHumanReadable(value)) return false;
  const parent =
    ts.isJsxExpression(node.parent) && node.parent.parent
      ? node.parent.parent
      : node.parent;
  if (!parent) return false;
  if (
    ts.isImportDeclaration(parent) ||
    ts.isExportDeclaration(parent) ||
    ts.isExternalModuleReference(parent)
  ) {
    return false;
  }
  const jsxAttribute = nearestJsxAttribute(node);
  if (jsxAttribute) {
    const name = jsxAttribute.name.getText();
    if (nonUserFacingPropertyNames.test(name)) return false;
    return userFacingPropertyNames.test(name);
  }
  if (isRenderedInsideJsx(node)) return true;
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent)) &&
    parent.name === node
  ) {
    return false;
  }
  if (ts.isJsxAttribute(parent)) {
    const name = parent.name.getText();
    if (nonUserFacingPropertyNames.test(name)) return false;
    return userFacingPropertyNames.test(name);
  }
  if (
    ts.isJsxElement(parent) ||
    ts.isJsxFragment(parent) ||
    ts.isJsxSelfClosingElement(parent)
  ) {
    return true;
  }
  if (ts.isPropertyAssignment(parent)) {
    const name = propertyName(parent.name);
    if (name && nonUserFacingPropertyNames.test(name)) return false;
    if (name && userFacingPropertyNames.test(name)) return true;
    if (
      /^[A-Z0-9_]+_(?:DESCRIPTIONS?|LABELS?|MESSAGES?|TOOLTIPS?|TITLES?)$/.test(
        enclosingVariableName(parent),
      )
    ) {
      return true;
    }
  }
  if (ts.isCallExpression(parent)) {
    const name = callName(parent.expression);
    const firstSegment = name?.split(".")[0];
    const lastSegment = name?.split(".").at(-1);
    if (
      (firstSegment && userFacingCallNames.test(firstSegment)) ||
      (lastSegment && userFacingCallNames.test(lastSegment))
    ) {
      return true;
    }
  }
  if (ts.isNewExpression(parent) && parent.expression.getText() === "Error") {
    return true;
  }
  if (
    ts.isVariableDeclaration(parent) &&
    ts.isIdentifier(parent.name) &&
    !/(?:class|className|classes|selector|style|testId)$/i.test(
      parent.name.text,
    ) &&
    userFacingVariableNames.test(parent.name.text)
  ) {
    return true;
  }
  if (ts.isReturnStatement(parent) && parent.expression === node) {
    const name = enclosingFunctionName(parent);
    return userFacingVariableNames.test(name);
  }
  if (
    ts.isLiteralTypeNode(parent) ||
    ts.isTypeAliasDeclaration(parent) ||
    ts.isUnionTypeNode(parent)
  ) {
    return false;
  }
  return false;
}

function templateText(node) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (!ts.isTemplateExpression(node)) return null;
  let value = node.head.text;
  for (const span of node.templateSpans) {
    value += `{{value}}${span.literal.text}`;
  }
  return value;
}

function staticStringExpression(node) {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) {
    return staticStringExpression(node.expression);
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticStringExpression(node.left);
    const right = staticStringExpression(node.right);
    return left === null || right === null ? null : `${left}${right}`;
  }
  return null;
}

function decodeRustString(value) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value
      .replaceAll('\\"', '"')
      .replaceAll("\\n", "\n")
      .replaceAll("\\t", "\t")
      .replaceAll("\\\\", "\\");
  }
}

function normalizeRustTemplate(value) {
  return normalize(
    decodeRustString(value)
      .replace(/\\\s+/g, " ")
      .replace(
        /\{(?:(?:[A-Za-z_][A-Za-z0-9_]*|\d+)(?::[^}]*)?)?\}/g,
        "{{value}}",
      ),
  );
}

function auditRustUserVisibleStrings() {
  const findings = [];
  const relevantLine =
    /(?:(?:anyhow::)?(?:anyhow|bail)!\s*\(|Err\s*\(|ok_or(?:_else)?\s*\(|map_err\s*\(|message\s*:|health\s*:|return\s+format!\s*\()/;
  const stringLiteral = /"((?:\\.|[^"\\])*)"/g;

  for (const path of walkRustFiles(rustSourceRoot)) {
    const lines = readFileSync(path, "utf8").split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const relevant = relevantLine.exec(lines[index]);
      if (!relevant) continue;
      let expression = lines[index].slice(relevant.index);
      let matches = [...expression.matchAll(stringLiteral)];
      for (
        let lookahead = 1;
        matches.length === 0 && lookahead < 5;
        lookahead += 1
      ) {
        expression += ` ${lines[index + lookahead] ?? ""}`;
        matches = [...expression.matchAll(stringLiteral)];
      }

      for (const match of matches) {
        const text = normalizeRustTemplate(match[1]);
        if (!looksHumanReadable(text)) continue;
        if (
          /^(?:[A-Z0-9_]+:|[a-z0-9_.-]+\/[a-z0-9_.-]+$)/.test(text) ||
          /^[a-z][a-z0-9_.-]*=\S+$/i.test(text) ||
          /^You are\b/.test(text)
        ) {
          continue;
        }
        findings.push({
          context: "rust-user-visible",
          file: relative(desktopRoot, path),
          line: index + 1,
          text,
        });
        break;
      }
    }
  }
  return findings;
}

function auditPreviewFeatureStrings() {
  const manifest = JSON.parse(readFileSync(previewFeaturesPath, "utf8"));
  const findings = [];
  for (const [index, feature] of (manifest.features ?? []).entries()) {
    for (const property of ["name", "description"]) {
      const text = feature[property];
      if (typeof text !== "string" || !looksHumanReadable(text)) continue;
      findings.push({
        context: `preview-feature:${property}`,
        file: relative(desktopRoot, previewFeaturesPath),
        line: index + 1,
        text: normalize(text),
      });
    }
  }
  return findings;
}

export function auditUserVisibleStrings(root = sourceRoot) {
  const findings = [];

  for (const path of walkFiles(root)) {
    const source = readFileSync(path, "utf8");
    const sourceFile = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    function add(node, value, context) {
      const normalized = normalize(value);
      if (!looksHumanReadable(normalized)) return;
      const position = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(),
      );
      findings.push({
        context,
        file: relative(desktopRoot, path),
        line: position.line + 1,
        text: normalized,
      });
    }

    function visit(node) {
      if (ts.isJsxText(node)) {
        add(node, node.text, "jsx-text");
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
        !(
          ts.isBinaryExpression(node.parent) &&
          node.parent.operatorToken.kind === ts.SyntaxKind.PlusToken
        )
      ) {
        const text = staticStringExpression(node);
        if (text && shouldCollectString(node, text)) {
          add(node, text, contextFor(node));
        }
      } else if (ts.isStringLiteralLike(node)) {
        if (shouldCollectString(node, node.text)) {
          add(node, node.text, contextFor(node));
        }
      } else if (ts.isTemplateExpression(node)) {
        const text = templateText(node);
        if (text && shouldCollectString(node, text)) {
          add(node, text, contextFor(node));
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  if (root === sourceRoot) {
    findings.push(...auditRustUserVisibleStrings());
    findings.push(...auditPreviewFeatureStrings());
  }

  findings.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.text.localeCompare(right.text),
  );

  return findings;
}

if (process.argv[1] === import.meta.filename) {
  const findings = auditUserVisibleStrings();
  const uniqueTexts = new Set(findings.map((finding) => finding.text));

  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`);
  } else {
    for (const finding of findings) {
      process.stdout.write(
        `${finding.file}:${finding.line}\t${finding.context}\t${finding.text}\n`,
      );
    }
    process.stderr.write(
      `Found ${findings.length} user-visible occurrences across ${uniqueTexts.size} unique strings.\n`,
    );
  }
}
