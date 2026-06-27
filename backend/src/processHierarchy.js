
const NODE_EDGE_REGEX = /^[A-Z]->[A-Z]$/;


function validateEntries(rawEntries) {
  const invalidEntries = [];
  const validEdges = [];

  for (const raw of rawEntries) {
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

function buildSubtree(node, directedAdjacency) {
  const children = directedAdjacency.get(node) || [];
  const subtree = {};
  for (const child of children) {
    subtree[child] = buildSubtree(child, directedAdjacency);
  }
  return subtree;
}

function buildTreeObject(root, directedAdjacency) {
  return { [root]: buildSubtree(root, directedAdjacency) };
}

function computeDepth(root, directedAdjacency) {
  const children = directedAdjacency.get(root) || [];
  if (children.length === 0) return 1;
  let maxChildDepth = 0;
  for (const child of children) {
    maxChildDepth = Math.max(maxChildDepth, computeDepth(child, directedAdjacency));
  }
  return 1 + maxChildDepth;
}


function processHierarchy(rawEntries) {
  const { validEdges, invalidEntries } = validateEntries(rawEntries);
  const { firstOccurrenceEdges, duplicateEdges } = dedupeEdges(validEdges);
  const { resolvedEdges } = resolveDiamonds(firstOccurrenceEdges);

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
