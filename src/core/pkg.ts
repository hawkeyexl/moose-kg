/**
 * Locate the package root from a compiled (dist/*) or source (src/**) file,
 * for assets that ship with the package: package.json, schemas/.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Package root for a module URL (dist is one level down, src/* two). */
export function packageRoot(moduleUrl: string): string {
  const here = dirname(fileURLToPath(moduleUrl));
  for (const candidate of [join(here, ".."), join(here, "..", "..")]) {
    if (existsSync(join(candidate, "package.json"))) return candidate;
  }
  return here;
}

/** dockg's own version — stamped on the build agent by the provenance source. */
export function toolVersion(moduleUrl: string): string {
  const pkg = join(packageRoot(moduleUrl), "package.json");
  if (!existsSync(pkg)) return "unknown";
  return (JSON.parse(readFileSync(pkg, "utf8")) as { version: string }).version;
}

/**
 * Absolute path of the bundled frontmatter schema `dockg validate` defaults to.
 *
 * These are docmeta's bytes, not dockg's: docmeta publishes the common metadata
 * vocabularies and dockg implements graph behavior against them (ADR 01023).
 * Vendored rather than resolved from docmeta's registry because
 * `docmeta:kg:1.0.0-proposal.1` is a review draft — proposal 0023 forbids
 * registering the id until the community review concludes. The hash pin in
 * test/unit/kg-vocabulary.test.ts is what notices a new upstream revision.
 */
export function bundledSchemaPath(moduleUrl: string): string {
  return join(
    packageRoot(moduleUrl),
    "schemas",
    "docmeta-kg-1.0.0-proposal.1.json",
  );
}

/** Absolute path of the bundled SHACL shapes `dockg check` defaults to. */
export function bundledShapesPath(moduleUrl: string): string {
  return join(packageRoot(moduleUrl), "shapes", "dockg-0.5.ttl");
}
