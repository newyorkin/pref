declare const __PREF_REVISION__: string;

declare const process: {
  env: Record<string, string | undefined>;
};

declare module "node:child_process" {
  export function execFileSync(
    file: string,
    args: readonly string[],
    options: { encoding: "utf8" },
  ): string;
}
