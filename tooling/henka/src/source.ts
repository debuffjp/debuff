/**
 * Source mutants: small edits to a file's code, found from its syntax tree. Each one replaces a range
 * of the original text, so applying it is a string splice and line numbers never move.
 *
 * @module
 */
import type { Mutant } from "./index.js";

/** A change to one span of a source file. */
export interface SourceMutant extends Mutant {
  /** Path relative to the project root, with forward slashes. */
  file: string;
  line: number;
  column: number;
  /** UTF-16 offsets into the original text. */
  start: number;
  end: number;
  replacement: string;
}

/** The parts of an ESTree node the generator reads. Vite's `parseSync` (oxc) returns these, TypeScript included. */
interface Node {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

export type Parse = (
  file: string,
  code: string,
) => { program: Node; comments: { value: string; start: number; end: number }[]; errors: unknown[] };

const BINARY: Record<string, string> = {
  "+": "-",
  "-": "+",
  "*": "/",
  "/": "*",
  "%": "*",
  "<": "<=",
  "<=": "<",
  ">": ">=",
  ">=": ">",
  "===": "!==",
  "!==": "===",
  "==": "!=",
  "!=": "==",
};
const LOGICAL: Record<string, string> = { "&&": "||", "||": "&&" };
const ASSIGN: Record<string, string> = { "+=": "-=", "-=": "+=", "*=": "/=", "/=": "*=" };
/** What a function returns when its body is replaced, by return type annotation. */
const BODY: Record<string, string[]> = {
  TSVoidKeyword: ["{}"],
  TSNumberKeyword: ["{ return 0; }"],
  TSBooleanKeyword: ["{ return true; }", "{ return false; }"],
  TSStringKeyword: ['{ return ""; }'],
};
/** Keys that hold types, never code. */
const TYPE_KEYS = new Set(["typeAnnotation", "returnType", "typeParameters", "typeArguments", "superTypeArguments", "decorators"]);
/** TypeScript nodes whose `expression` is ordinary code: `x as T`, `x!`, `x satisfies T`. */
const TS_WRAPPERS = new Set([
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
  "TSInstantiationExpression",
]);
const FUNCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

/**
 * Every mutant in a file. Lines with a `henka-skip` comment (and the line after one) are left alone, and a
 * `henka-skip-file` comment anywhere skips the file.
 */
export function findMutants(file: string, code: string, parse: Parse): SourceMutant[] {
  const { program, comments, errors } = parse(file, code);
  if (errors.length) return [];
  const lineStarts = [0];
  for (let i = 0; i < code.length; i++) if (code[i] === "\n") lineStarts.push(i + 1);
  const lineOf = (offset: number) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((lineStarts[mid] ?? 0) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  const skipped = new Set<number>();
  for (const c of comments) {
    if (c.value.includes("henka-skip-file")) return [];
    if (c.value.includes("henka-skip")) skipped.add(lineOf(c.start)).add(lineOf(c.start) + 1);
  }

  const out: SourceMutant[] = [];
  const add = (start: number, end: number, replacement: string, context: Node) => {
    const line = lineOf(start);
    if (skipped.has(line)) return;
    const column = start - (lineStarts[line - 1] ?? 0) + 1;
    const original = code.slice(start, end);
    const before = code.slice(context.start, context.end);
    const after = code.slice(context.start, start) + replacement + code.slice(end, context.end);
    out.push({
      id: `${file}:${line}:${column}:${original}→${replacement}`,
      label: `${file}:${line}:${column} ${short(before)} → ${short(after)}`,
      expect: "noticed",
      file,
      line,
      column,
      start,
      end,
      replacement,
    });
  };
  /** The operator between two operands, found in the text between them so comments and parentheses don't matter. */
  const operator = (node: Node, left: Node, right: Node, op: string, to: string) => {
    let at = code.indexOf(op, left.end);
    for (let inside = commentAt(at); inside; inside = commentAt(at)) at = code.indexOf(op, inside.end);
    if (at >= 0 && at + op.length <= right.start) add(at, at + op.length, to, node);
  };
  const commentAt = (offset: number) => (offset < 0 ? undefined : comments.find((c) => c.start <= offset && offset < c.end));

  const visit = (node: Node, parent: Node | undefined, key: string): void => {
    if (node.type.startsWith("TS") && !TS_WRAPPERS.has(node.type)) return;
    if (node.type === "ImportDeclaration" || node.type === "ExportAllDeclaration") return;
    const left = node.left as Node | undefined;
    const right = node.right as Node | undefined;
    const op = node.operator as string | undefined;
    switch (node.type) {
      case "BinaryExpression":
        if (left && right && op && BINARY[op] && !(op === "+" && (isText(left) || isText(right))))
          operator(node, left, right, op, BINARY[op]);
        break;
      case "LogicalExpression":
        if (left && right && op && LOGICAL[op]) operator(node, left, right, op, LOGICAL[op]);
        break;
      case "AssignmentExpression":
        if (left && right && op && ASSIGN[op]) operator(node, left, right, op, ASSIGN[op]);
        break;
      case "UpdateExpression": {
        const arg = node.argument as Node;
        const at = node.prefix ? node.start : arg.end;
        add(at, at + 2, op === "++" ? "--" : "++", node);
        break;
      }
      case "UnaryExpression": {
        const arg = node.argument as Node;
        if (op === "!" || (op === "-" && arg.type !== "Literal")) add(node.start, arg.start, "", node);
        break;
      }
      case "Literal":
        if (typeof node.value === "number" && !isKey(parent, key)) add(node.start, node.end, node.value === 0 ? "1" : "0", node);
        break;
    }
    if (FUNCTIONS.has(node.type)) functionBody(node, parent);
    for (const [k, value] of Object.entries(node)) {
      if (TYPE_KEYS.has(k)) continue;
      if (Array.isArray(value)) {
        for (const child of value) if (isNode(child)) visit(child, node, k);
      } else if (isNode(value)) visit(value, node, k);
    }
  };

  const functionBody = (fn: Node, parent: Node | undefined) => {
    const body = fn.body as Node | undefined;
    if (body?.type !== "BlockStatement" || fn.generator) return;
    if (parent?.type === "MethodDefinition" && parent.kind !== "method") return;
    if (!(body.body as Node[]).length) return;
    const annotation = ((fn.returnType as Node | undefined)?.typeAnnotation as Node | undefined)?.type;
    const bodies = annotation ? (BODY[annotation] ?? (fn.async && isPromiseOfVoid(fn) ? ["{}"] : [])) : returnsNothing(body) ? ["{}"] : [];
    for (const replacement of bodies) add(body.start, body.end, replacement, body);
  };

  visit(program, undefined, "");
  return out;
}

/** Apply a mutant to the text it was found in. */
export function applyMutant(code: string, mutant: Pick<SourceMutant, "start" | "end" | "replacement">): string {
  return code.slice(0, mutant.start) + mutant.replacement + code.slice(mutant.end);
}

function isNode(v: unknown): v is Node {
  return typeof v === "object" && v !== null && typeof (v as Node).type === "string";
}

function isText(n: Node): boolean {
  return (n.type === "Literal" && typeof n.value === "string") || n.type === "TemplateLiteral";
}

/** A number used as a name (`{ 1: x }`, `class { 0() {} }`) rather than a value. */
function isKey(parent: Node | undefined, key: string): boolean {
  return (
    key === "key" &&
    !!parent &&
    !parent.computed &&
    (parent.type === "Property" || parent.type === "MethodDefinition" || parent.type === "PropertyDefinition")
  );
}

/** True when a block has no `return <value>` of its own (nested functions don't count). */
function returnsNothing(block: Node): boolean {
  let found = false;
  const walk = (n: Node) => {
    if (found) return;
    if (n.type === "ReturnStatement" && n.argument) found = true;
    if (FUNCTIONS.has(n.type) || n.type.startsWith("TS")) return;
    for (const v of Object.values(n)) {
      if (Array.isArray(v)) for (const c of v) isNode(c) && walk(c);
      else if (isNode(v)) walk(v);
    }
  };
  for (const s of block.body as Node[]) walk(s);
  return !found;
}

function isPromiseOfVoid(fn: Node): boolean {
  const t = (fn.returnType as Node | undefined)?.typeAnnotation as Node | undefined;
  const name = (t?.typeName as Node | undefined)?.name;
  const args = ((t?.typeArguments as Node | undefined)?.params as Node[] | undefined) ?? [];
  return name === "Promise" && args[0]?.type === "TSVoidKeyword";
}

function short(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > 60 ? `${one.slice(0, 57)}...` : one;
}
