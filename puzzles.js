// PUZZLE mode boards: clear the whole board using exactly the bits given, in order.
// Each column lists its blocks bottom to top: a number is a bit; 'L2:5' is an encryption
// layer at level 2 hiding a [5] (revealed when it's peeled to 0). Generated and verified by
// brute force against the game's rules: every puzzle has 1-2 solutions and none can be
// solved in fewer drops. Ordered easiest first (1 drop, then 2, then 3; layers from 17).
const PUZZLES = [
  { board: [[3],[3],[],[4],[],[],[]], pieces: [3] },
  { board: [[],[4,3],[2],[2],[],[],[]], pieces: [4] },
  { board: [[5],[],[2],[2],[4],[],[]], pieces: [4] },
  { board: [[],[4],[4],[4],[4],[2],[]], pieces: [2] },
  { board: [[],[],[5],[5],[3],[3],[]], pieces: [3] },
  { board: [[],[],[],[],[2],[2],[2]], pieces: [2] },
  { board: [[2],[2],[6],[],[6],[6],[]], pieces: [6] },
  { board: [[],[4],[4],[],[4],[5],[]], pieces: [4] },
  { board: [[],[5],[6],[],[6,5],[5],[4,4]], pieces: [5,5] },
  { board: [[2],[],[],[6,3],[3],[3],[7]], pieces: [6,2] },
  { board: [[],[],[2],[],[4],[6],[6]], pieces: [2,4] },
  { board: [[5],[2],[2],[2],[],[],[]], pieces: [4,2] },
  { board: [[6,3,2,6],[],[],[],[],[],[]], pieces: [6,2] },
  { board: [[4],[4],[],[4,3],[5],[],[]], pieces: [2,4] },
  { board: [[4,1],[5,3],[2],[],[2],[],[]], pieces: [2,2] },
  { board: [[],[4],[4,3],[4],[],[],[]], pieces: [1,1] },
  { board: [[],[6],[6],["L2:2"],[2],[],[4]], pieces: [2,4] },
  { board: [[2],["L2:2"],["L2:1",3],[3,1],[],[],[]], pieces: [3,2] },
  { board: [[],[6],["L2:4"],[3],[2],["L1:1"],[]], pieces: [5,6] },
  { board: [[],[6],["L1:6"],["L1:1"],[3],[2],[]], pieces: [6,2] },
  { board: [[],["L2:1"],[7],[],["L1:1"],["L1:1"],[4]], pieces: [4,7] },
  { board: [[5,2,4],[],["L1:2"],["L1:2"],[],[6],[]], pieces: [3,5] },
  { board: [[6],[4],[5,4],[],[4],[],[7,2,4]], pieces: [4,1,6] },
  { board: [[],[6],[],[2],[2],[5,4],[2]], pieces: [3,4,5] },
  { board: [[],[],[6,6,6],[],[2],[2],[4]], pieces: [5,5,5] },
  { board: [[3],[5,3],[],[6,1],[1,1],[2],[]], pieces: [2,3,1] },
  { board: [[5,2,5],[6],["L1:5",3,2,6],[7],[],[3],["L1:2"]], pieces: [6,6,2] },
  { board: [[],["L2:4",4],["L2:3",1],["L2:1"],[3],["L2:5",5],[7,7]], pieces: [3,1,2] },
  { board: [["L1:4",6,6,2,3],[],[3],[],[],[3,3],[]], pieces: [1,2,3] },
  { board: [["L1:7"],[2],[2],["L1:3",3],[],["L1:6"],[7]], pieces: [1,6,1] },
];
