/** Pure T-Box queries shared by the ontology tree, graph, and detail panes. */
import {
  AXIOMS,
  CLASSES,
  DATA_PROPERTIES,
  OBJECT_PROPERTIES,
  ancestors,
  classById,
  type Axiom,
  type ClassId,
  type DataProperty,
  type ObjectProperty,
  type OntologyClass,
} from "./schema.ts";

export type ConceptRelation = {
  property: ObjectProperty;
  /** Always the domain declared by the schema; never replaced by a selected subclass. */
  source: OntologyClass;
  /** Always the range declared by the schema; never replaced by a selected subclass. */
  target: OntologyClass;
  /** Query-specific endpoint matches, including relations inherited from an ancestor. */
  applicability: RelationApplicability[];
};

export type RelationApplicability = {
  concept: OntologyClass;
  endpoint: "source" | "target";
  /** null means the relation is declared directly on concept. */
  inheritedFrom: OntologyClass | null;
};

export type ConceptRelations = {
  incoming: ConceptRelation[];
  outgoing: ConceptRelation[];
};

export type ConceptNeighborhood = {
  classes: OntologyClass[];
  relations: ConceptRelation[];
};

export type ConceptTreeNode = {
  concept: OntologyClass;
  children: ConceptTreeNode[];
};

const relations: ConceptRelation[] = OBJECT_PROPERTIES.map((property) => ({
  property,
  source: classById(property.domain)!,
  target: classById(property.range)!,
  applicability: [],
}));

const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase();

/** Empty input intentionally returns the complete taxonomy for browse mode. */
export function searchConcepts(query: string): OntologyClass[] {
  const needle = normalize(query);
  if (!needle) return [...CLASSES];
  return CLASSES.filter((concept) =>
    normalize([concept.label, concept.id, concept.note, concept.codeSource].join(" ")).includes(needle),
  );
}

function withApplicability(
  relation: ConceptRelation,
  concept: OntologyClass,
  endpoint: RelationApplicability["endpoint"],
): ConceptRelation {
  const declaredAt = endpoint === "source" ? relation.source : relation.target;
  return {
    ...relation,
    applicability: [{
      concept,
      endpoint,
      inheritedFrom: declaredAt.id === concept.id ? null : declaredAt,
    }],
  };
}

/** Object-property domains and ranges apply to their descendants. */
export function conceptRelations(id: ClassId): ConceptRelations {
  const concept = classById(id);
  if (!concept) return { incoming: [], outgoing: [] };
  const lineage = new Set<ClassId>([id, ...ancestors(id)]);
  return {
    incoming: relations
      .filter((relation) => lineage.has(relation.target.id))
      .map((relation) => withApplicability(relation, concept, "target")),
    outgoing: relations
      .filter((relation) => lineage.has(relation.source.id))
      .map((relation) => withApplicability(relation, concept, "source")),
  };
}

function mergeRelation(
  observed: Map<string, ConceptRelation>,
  relation: ConceptRelation,
): void {
  const existing = observed.get(relation.property.id);
  if (!existing) {
    observed.set(relation.property.id, relation);
    return;
  }

  const keys = new Set(existing.applicability.map((match) =>
    `${match.concept.id}:${match.endpoint}:${match.inheritedFrom?.id ?? "direct"}`));
  const additions = relation.applicability.filter((match) =>
    !keys.has(`${match.concept.id}:${match.endpoint}:${match.inheritedFrom?.id ?? "direct"}`));
  if (additions.length > 0) {
    observed.set(relation.property.id, {
      ...existing,
      applicability: [...existing.applicability, ...additions],
    });
  }
}

/**
 * Follow incoming and outgoing schema edges for one or two hops.
 * These are T-Box declarations, not materialized runtime causality or A-Box instances.
 */
export function conceptNeighborhood(id: ClassId, depth: 1 | 2 = 1): ConceptNeighborhood {
  if (!classById(id)) return { classes: [], relations: [] };

  const visited = new Set<ClassId>([id]);
  const observed = new Map<string, ConceptRelation>();
  let frontier = new Set<ClassId>([id]);
  for (let hop = 0; hop < depth; hop += 1) {
    const next = new Set<ClassId>();
    for (const conceptId of frontier) {
      const applicable = conceptRelations(conceptId);
      for (const relation of applicable.outgoing) {
        mergeRelation(observed, relation);
        // Keep the arrow on its actual schema endpoint while retaining the selected subclass.
        visited.add(relation.source.id);
        next.add(relation.target.id);
      }
      for (const relation of applicable.incoming) {
        mergeRelation(observed, relation);
        visited.add(relation.target.id);
        next.add(relation.source.id);
      }
    }
    frontier = new Set([...next].filter((conceptId) => !visited.has(conceptId)));
    frontier.forEach((conceptId) => visited.add(conceptId));
  }

  // Preserve the previous induced-subgraph behavior for direct declarations between visited nodes.
  for (const relation of relations) {
    if (visited.has(relation.source.id) && visited.has(relation.target.id) &&
        !observed.has(relation.property.id)) {
      observed.set(relation.property.id, relation);
    }
  }

  return {
    classes: CLASSES.filter((concept) => visited.has(concept.id)),
    relations: relations
      .filter((relation) => observed.has(relation.property.id))
      .map((relation) => observed.get(relation.property.id)!),
  };
}

/** A property declared on a parent class also applies to every descendant. */
export function conceptProperties(id: ClassId): DataProperty[] {
  if (!classById(id)) return [];
  const domains = new Set<ClassId>([id, ...ancestors(id)]);
  return DATA_PROPERTIES.filter((property) => domains.has(property.domain));
}

/** Class axioms apply to descendants of either class endpoint. */
export function conceptAxioms(id: ClassId): Axiom[] {
  if (!classById(id)) return [];
  const lineage = new Set<ClassId>([id, ...ancestors(id)]);
  return AXIOMS.filter(
    (axiom) => lineage.has(axiom.left) || (axiom.kind !== "functional" && lineage.has(axiom.right)),
  );
}

function childrenOf(parent: ClassId | null): ConceptTreeNode[] {
  return CLASSES.filter((concept) => concept.parent === parent).map((concept) => ({
    concept,
    children: childrenOf(concept.id),
  }));
}

/** Stable root and sibling order follows CLASSES, the schema's display order. */
export const domainHierarchy: ConceptTreeNode[] = childrenOf(null);
