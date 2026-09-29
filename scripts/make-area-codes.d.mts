/** Types for the area-code generator, so tests can import it under tsc. */
export declare const SOURCE_PAGE: string;
export declare function readAssignments(dir: string): {
  lengths: Map<string, number>;
  dates: string[];
  rows: number;
};
export declare function compressRules(lengths: Map<string, number>): [string, number][];
export declare function renderModule(input: {
  rules: [string, number][];
  dates: string[];
  rows: number;
}): string;
export declare function parseCsv(text: string): string[][];
