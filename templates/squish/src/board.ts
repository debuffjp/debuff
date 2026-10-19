// The match-3 rules, as plain functions over a grid of colours. No drawing, no timing: easy to read, and the
// logic tests in tests/ can check every rule directly. src/main.ts animates what these functions decide.

/** A colour index 0..colours-1, or EMPTY. */
export type Cell = number;
export const EMPTY = -1;

export interface Board {
  w: number;
  h: number;
  /** Row-major: index = y * w + x. */
  cells: Cell[];
}

export const at = (b: Board, x: number, y: number): Cell =>
  x < 0 || y < 0 || x >= b.w || y >= b.h ? EMPTY : (b.cells[y * b.w + x] ?? EMPTY);

export function adjacent(b: Board, a: number, c: number): boolean {
  const ax = a % b.w,
    ay = Math.floor(a / b.w),
    cx = c % b.w,
    cy = Math.floor(c / b.w);
  return Math.abs(ax - cx) + Math.abs(ay - cy) === 1;
}

export function swap(b: Board, a: number, c: number): void {
  const t = b.cells[a]!;
  b.cells[a] = b.cells[c]!;
  b.cells[c] = t;
}

/** Every cell that's part of a line of 3 or more of the same colour, across or down. */
export function findMatches(b: Board): Set<number> {
  const out = new Set<number>();
  const scan = (len: number, lines: number, cell: (line: number, i: number) => number) => {
    for (let line = 0; line < lines; line++) {
      let run = 1;
      for (let i = 1; i <= len; i++) {
        const same = i < len && b.cells[cell(line, i)] !== EMPTY && b.cells[cell(line, i)] === b.cells[cell(line, i - 1)];
        if (same) run++;
        else {
          if (run >= 3) for (let k = i - run; k < i; k++) out.add(cell(line, k));
          run = 1;
        }
      }
    }
  };
  scan(b.w, b.h, (y, x) => y * b.w + x);
  scan(b.h, b.w, (x, y) => y * b.w + x);
  return out;
}

/** Would swapping a and c make a match? Leaves the board as it was. */
export function swapMatches(b: Board, a: number, c: number): boolean {
  swap(b, a, c);
  const any = findMatches(b).size > 0;
  swap(b, a, c);
  return any;
}

/** A swap that makes a match, or undefined when the board is stuck. */
export function findMove(b: Board): [number, number] | undefined {
  for (let i = 0; i < b.cells.length; i++) {
    const right = i % b.w < b.w - 1 ? i + 1 : -1;
    const down = i + b.w < b.cells.length ? i + b.w : -1;
    if (right >= 0 && swapMatches(b, i, right)) return [i, right];
    if (down >= 0 && swapMatches(b, i, down)) return [i, down];
  }
  return undefined;
}

export interface Fall {
  /** Where the piece ends up. */
  to: number;
  /** Where it falls from: a cell index, or for new pieces, rows above the board (negative y). */
  fromX: number;
  fromY: number;
  /** New pieces carry their colour. */
  colour?: Cell;
}

/**
 * Let pieces fall into the gaps and fill the top with new ones from `next()`. Returns every move, including the
 * new pieces dropping in from above, so the game can animate them.
 */
export function collapse(b: Board, next: () => Cell): Fall[] {
  const falls: Fall[] = [];
  for (let x = 0; x < b.w; x++) {
    let write = b.h - 1;
    for (let y = b.h - 1; y >= 0; y--) {
      const c = b.cells[y * b.w + x]!;
      if (c === EMPTY) continue;
      if (write !== y) {
        b.cells[write * b.w + x] = c;
        b.cells[y * b.w + x] = EMPTY;
        falls.push({ to: write * b.w + x, fromX: x, fromY: y });
      }
      write--;
    }
    // New pieces stack up above the board, in the order they'll land.
    for (let y = write, above = -1; y >= 0; y--, above--) {
      const colour = next();
      b.cells[y * b.w + x] = colour;
      falls.push({ to: y * b.w + x, fromX: x, fromY: above, colour });
    }
  }
  return falls;
}

/** A fresh board with no ready-made matches and at least one move. */
export function fill(w: number, h: number, colours: number, random: () => number): Board {
  for (;;) {
    const b: Board = { w, h, cells: [] };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let c: Cell;
        do c = Math.floor(random() * colours);
        while ((at(b, x - 1, y) === c && at(b, x - 2, y) === c) || (at(b, x, y - 1) === c && at(b, x, y - 2) === c));
        b.cells.push(c);
      }
    if (findMove(b)) return b;
  }
}

/** Board as text, a letter per colour ("." for empty): for tests and for inspect(). */
export const toRows = (b: Board): string[] =>
  Array.from({ length: b.h }, (_, y) =>
    b.cells
      .slice(y * b.w, y * b.w + b.w)
      .map((c) => (c === EMPTY ? "." : String.fromCharCode(97 + c)))
      .join(""),
  );

export const fromRows = (rows: readonly string[]): Board => ({
  w: rows[0]?.length ?? 0,
  h: rows.length,
  cells: rows.flatMap((r) => [...r].map((ch) => (ch === "." ? EMPTY : ch.charCodeAt(0) - 97))),
});
