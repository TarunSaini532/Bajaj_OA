const { processHierarchy } = require('./src/processHierarchy');

function logResult(label, input) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(processHierarchy(input), null, 2));
}

// Exact example from the PDF spec.
const specExample = [
  'A->B', 'A->C', 'B->D', 'C->E', 'E->F',
  'X->Y', 'Y->Z', 'Z->X',
  'P->Q', 'Q->R',
  'G->H', 'G->H', 'G->I',
  'hello', '1->2', 'A->',
];

logResult('Spec example', specExample);

// Edge cases: whitespace, empty string, multi-char, wrong separator, self-loop
logResult('Validation edge cases', [
  ' A->B ', 'AB->C', 'A-B', '', 'A->A', 'a->b',
]);

// Diamond case: A->D and B->D - first wins
logResult('Diamond / multi-parent', ['A->C', 'B->D', 'C->D']);

// Pure cycle with no valid root
logResult('Pure cycle', ['A->B', 'B->C', 'C->A']);

// Tree feeding into a cycle (component has a root, but cycle exists inside)
logResult('Tree feeding into cycle', ['A->B', 'B->C', 'C->B']);

// Tie-break on largest_tree_root (equal depth, smaller root wins)
logResult('Tie-break on depth', ['B->C', 'A->D']);
