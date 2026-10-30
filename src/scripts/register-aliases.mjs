// Lets plain `node` run the TypeScript scripts in this folder:
//   node --import ./src/scripts/register-aliases.mjs src/scripts/<script>.ts
// Node strips the types itself; this maps the tsconfig "@/*" alias to src/
// and resolves extensionless imports ("./env" → "./env.ts", "@/db" → "@/db/index.ts").
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const srcUrl = pathToFileURL(`${process.cwd()}/src/`).href;
const TRY_NEXT_CANDIDATE = new Set([
  "ERR_MODULE_NOT_FOUND",
  "ERR_UNSUPPORTED_DIR_IMPORT",
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const target = specifier.startsWith("@/")
      ? srcUrl + specifier.slice(2)
      : specifier;

    // packages (and node: builtins) resolve as usual
    if (!target.startsWith(".") && !target.startsWith("file:")) {
      return nextResolve(target, context);
    }

    for (const candidate of [target, `${target}.ts`, `${target}/index.ts`]) {
      try {
        return nextResolve(candidate, context);
      } catch (error) {
        if (!TRY_NEXT_CANDIDATE.has(error?.code)) throw error;
      }
    }
    // rethrows the original error for the specifier as written
    return nextResolve(target, context);
  },
});
