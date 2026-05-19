declare const Bun: {
  file(path: string): {
    json(): Promise<Record<string, unknown>>;
    text(): Promise<string>;
  };
};

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  stdin: AsyncIterable<Uint8Array> & { isTTY?: boolean };
  exit(code?: number): never;
};

declare const Buffer: {
  concat(chunks: Uint8Array[]): { toString(encoding?: string): string };
};

declare module 'node:path' {
  const path: {
    resolve(...paths: string[]): string;
  };
  export default path;
}

declare module 'node:url' {
  export function fileURLToPath(url: string): string;
}
