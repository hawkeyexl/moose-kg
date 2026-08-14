/**
 * Namespace table. Standard vocabularies wherever a term exists; the custom
 * `moose-kg:` namespace stays minimal (2 classes, 10 properties). The prefix set
 * is fixed — every emitted graph carries the same header.
 */
export const NS = {
  dcterms: "http://purl.org/dc/terms/",
  foaf: "http://xmlns.com/foaf/0.1/",
  iirds: "http://iirds.tekom.de/iirds#",
  iirdsSft: "http://iirds.tekom.de/iirds/domain/software#",
  // Quoted because `moose-kg` is a legal Turtle prefix (PN_PREFIX admits `-`)
  // but not a legal JS identifier. The key IS the emitted prefix — keeping one
  // source of truth is worth the quotes and the MOOSE_KG alias below.
  "moose-kg": "https://moose-tools.dev/kg/ns#",
  prov: "http://www.w3.org/ns/prov#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  schema: "https://schema.org/",
  skos: "http://www.w3.org/2004/02/skos/core#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
} as const;

export type Prefix = keyof typeof NS;

/**
 * The project's own namespace IRI. An alias because `NS["moose-kg"]` reads
 * badly at the ~145 call sites that build terms out of it.
 */
export const MOOSE_KG = NS["moose-kg"];

/** Prefixes in emission order (sorted by prefix name). */
export const PREFIXES: ReadonlyArray<[Prefix, string]> = (
  Object.entries(NS) as Array<[Prefix, string]>
).sort(([a], [b]) => (a < b ? -1 : 1));

export const RDF_TYPE = `${NS.rdf}type`;

/**
 * Role individuals for qualified provenance (prov:hadRole objects). Part of
 * the deliberately small moose-kg vocabulary.
 */
export const ROLE = {
  author: `${MOOSE_KG}authorRole`,
  generator: `${MOOSE_KG}generatorRole`,
  tool: `${MOOSE_KG}toolRole`,
} as const;
