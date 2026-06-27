/**
 * Core processing logic for the /bfhl endpoint.
 * Kept as a pure function (no Express, no I/O) so it can be unit-tested
 * directly against the spec's example before being wired into a route.
 */

const NODE_EDGE_REGEX = /^[A-Z]->[A-Z]$/;

/**
 * Validates and classifies raw input strings.
 * Returns { validEdges, invalidEntries } where validEdges preserves
 * original order and is the list of "X->Y" strings (post-trim) that
 * passed validation (excluding self-loops).
 */
function validateEntries(rawEntries) {
  const invalidEntries = [];
  const validEdges = [];

  for (const raw of rawEntries) {
    // Trim whitespace first, then validate (per spec rule 2).
    const trimmed = typeof raw === 'string' ? raw.trim() : '';

    if (trimmed === '' || !NODE_EDGE_REGEX.test(trimmed)) {
      invalidEntries.push(raw);
      continue;
    }

    const [parent, child] = trimmed.split('->');
    if (parent === child) {
      // Self-loop, e.g. "A->A" - explicitly invalid per spec.
      invalidEntries.push(raw);
      continue;
    }

    validEdges.push(trimmed);
  }

  return { validEdges, invalidEntries };
}

/**
 * Walks valid edges in order, separating first-occurrences from
 * duplicates. Each repeated edge string is pushed to duplicateEdges
 * only once, regardless of how many extra times it repeats.
 */
function dedupeEdges(validEdges) {
  const seen = new Set();
  const duplicateEdges = [];
  const firstOccurrenceEdges = [];
  const alreadyFlaggedAsDuplicate = new Set();

  for (const edge of validEdges) {
    if (!seen.has(edge)) {
      seen.add(edge);
      firstOccurrenceEdges.push(edge);
    } else if (!alreadyFlaggedAsDuplicate.has(edge)) {
      alreadyFlaggedAsDuplicate.add(edge);
      duplicateEdges.push(edge);
    }
    // further repeats of an edge already flagged are silently ignored
  }

  return { firstOccurrenceEdges, duplicateEdges };
}

/**
 * Resolves multi-parent ("diamond") conflicts: the first edge that
 * assigns a parent to a given child wins. Any later edge targeting
 * the same child (with a different parent) is silently discarded.
 */
function resolveDiamonds(edges) {
  const parentOf = new Map(); // child -> parent
  const resolvedEdges = [];

  for (const edge of edges) {
    const [parent, child] = edge.split('->');
    if (parentOf.has(child)) {
      // Child already has a parent assigned - discard this edge.
      continue;
    }
    parentOf.set(child, parent);
    resolvedEdges.push([parent, child]);
  }

  return { resolvedEdges, parentOf };
}

/**
 * Groups nodes into connected components (treating edges as undirected
 * for the purpose of grouping, since a cycle can appear anywhere in a
 * component and must invalidate the whole group).
 */
function groupIntoComponents(resolvedEdges) {
  const adjacency = new Map(); // undirected, for grouping
  const allNodes = new Set();

  for (const [parent, child] of resolvedEdges) {
    allNodes.add(parent);
    allNodes.add(child);
    if (!adjacency.has(parent)) adjacency.set(parent, []);
    if (!adjacency.has(child)) adjacency.set(child, []);
    adjacency.get(parent).push(child);
    adjacency.get(child).push(parent);
  }

  const visited = new Set();
  const components = [];

  for (const node of allNodes) {
    if (visited.has(node)) continue;
    const component = [];
    const stack = [node];
    visited.add(node);
    while (stack.length) {
      const current = stack.pop();
      component.push(current);
      for (const neighbor of adjacency.get(current) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
    components.push(component);
  }

  return components;
}

/**
 * Detects whether a directed-edge subset (restricted to a given set of
 * nodes) contains a cycle, using recursive DFS with a recursion-stack set.
 * Graphs here are small (<=50 nodes per spec), so plain recursion is safe.
 */
function hasCycle(nodes, directedAdjacency) {
  const nodeSet = new Set(nodes);
  const visited = new Set();
  const onStack = new Set();

  function dfs(node) {
    visited.add(node);
    onStack.add(node);

    for (const child of directedAdjacency.get(node) || []) {
      if (!nodeSet.has(child)) continue;
      if (onStack.has(child)) return true; // back edge -> cycle
      if (!visited.has(child) && dfs(child)) return true;
    }

    onStack.delete(node);
    return false;
  }

  for (const node of nodes) {
    if (!visited.has(node) && dfs(node)) return true;
  }
  return false;
}

/** Recursively builds the nested children-object for a given node. */
function buildSubtree(node, directedAdjacency) {
  const children = directedAdjacency.get(node) || [];
  const subtree = {};
  for (const child of children) {
    subtree[child] = buildSubtree(child, directedAdjacency);
  }
  return subtree;
}

/** Builds the full tree object: { root: { ...nested children... } }. */
function buildTreeObject(root, directedAdjacency) {
  return { [root]: buildSubtree(root, directedAdjacency) };
}

/** Computes depth (node count) of the longest root-to-leaf path. */
function computeDepth(root, directedAdjacency) {
  const children = directedAdjacency.get(root) || [];
  if (children.length === 0) return 1;
  let maxChildDepth = 0;
  for (const child of children) {
    maxChildDepth = Math.max(maxChildDepth, computeDepth(child, directedAdjacency));
  }
  return 1 + maxChildDepth;
}

/**
 * Main entry point: takes the raw `data` array from the request body
 * and returns the hierarchies, invalidEntries, duplicateEdges, and summary.
 */
function processHierarchy(rawEntries) {
  const { validEdges, invalidEntries } = validateEntries(rawEntries);
  const { firstOccurrenceEdges, duplicateEdges } = dedupeEdges(validEdges);
  const { resolvedEdges } = resolveDiamonds(firstOccurrenceEdges);

  // Build a directed adjacency list (parent -> children) from resolved edges.
  const directedAdjacency = new Map();
  const childSet = new Set(); // nodes that appear as a child at least once
  for (const [parent, child] of resolvedEdges) {
    if (!directedAdjacency.has(parent)) directedAdjacency.set(parent, []);
    directedAdjacency.get(parent).push(child);
    childSet.add(child);
  }

  const components = groupIntoComponents(resolvedEdges);

  const hierarchies = [];

  for (const component of components) {
    const componentSet = new Set(component);
    const cyclic = hasCycle(component, directedAdjacency);

    if (cyclic) {
      // Pure cycle, or a tree that feeds into a cycle - whole group is cyclic.
      // Per spec: if a group has no valid root, use lexicographically
      // smallest node. We apply the same lexicographic fallback whenever
      // the group is cyclic, since a cyclic hierarchy object has no
      // meaningful single root either way.
      const rootsInComponent = component.filter((n) => !childSet.has(n));
      const root =
        rootsInComponent.length > 0
          ? [...rootsInComponent].sort()[0]
          : [...componentSet].sort()[0];

      hierarchies.push({
        root,
        tree: {},
        has_cycle: true,
      });
    } else {
      // Non-cyclic component: exactly one root (node never appearing as a child).
      const rootsInComponent = component.filter((n) => !childSet.has(n));
      const root = rootsInComponent[0]; // guaranteed exactly one in an acyclic component
      const fullTree = buildTreeObject(root, directedAdjacency);
      const depth = computeDepth(root, directedAdjacency);

      hierarchies.push({
        root,
        tree: fullTree,
        depth,
      });
    }
  }

  // Sort hierarchies for deterministic, readable output: trees first
  // (in order of first appearance via root's first-seen edge), but to
  // keep it simple and deterministic we sort by root label. This does
  // not affect correctness of the data, only display order.
  hierarchies.sort((a, b) => (a.root < b.root ? -1 : a.root > b.root ? 1 : 0));

  const nonCyclic = hierarchies.filter((h) => !h.has_cycle);
  const cyclicCount = hierarchies.filter((h) => h.has_cycle).length;

  let largestTreeRoot = null;
  if (nonCyclic.length > 0) {
    let best = nonCyclic[0];
    for (const h of nonCyclic.slice(1)) {
      if (
        h.depth > best.depth ||
        (h.depth === best.depth && h.root < best.root)
      ) {
        best = h;
      }
    }
    largestTreeRoot = best.root;
  }

  return {
    hierarchies,
    invalidEntries,
    duplicateEdges,
    summary: {
      total_trees: nonCyclic.length,
      total_cycles: cyclicCount,
      largest_tree_root: largestTreeRoot,
    },
  };
}

module.exports = {
  processHierarchy,
  // exported for unit testing individual pieces
  validateEntries,
  dedupeEdges,
  resolveDiamonds,
};
