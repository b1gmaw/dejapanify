/** Types for the source-archive builder, so tests can import it under tsc. */
export declare function makeSourceArchive(outFile?: string): {
  outFile: string;
  count: number;
  bytes: number;
};
