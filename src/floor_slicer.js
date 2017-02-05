/**
 * See docs/LAYOUT.md for context.
 **/

var { MA_N, MA_E, MA_U, MA_S, MA_W, MA_D, MANHATTAN_LEFT_MAPPING } =
  require('./vox_blocks');

/**
 * VoxFace types.
 *
 * Note that we may need to add NE/SE/SW/NW deflection faces in the future to
 * deal with the ramifications of insets.  Specifically, whenever our clockwise
 * traversal finds it has to make a left-hand turn (so that there are 90 degrees
 * of empty space, rather than when we hit a corner and there are 270 degrees
 * of empty space), the two faces don't magically join without some help.
 *
 * Our options are:
 * 1. Create a specific voxface type for this internal join.
 * 2. Mark the deflections on the edge next/prev face links and leave it to the
 *    wall-planner to special case the deflection.
 *
 * Currently we do the latter because when I sketched this all out in my head I
 * was assuming the wall planner would be proactively aware of its adjacent
 * faces and ensure the points terminate at the same spot.  While the planner
 * will need to potentially do something like that in the future, the current
 * deflection flags are good-ish enough.
 */
var VFT_N = 0; // connect west and east block sides facing north.
var VFT_NE_CORN = 1; // connect west and south block sides facing NE.
var VFT_E = 2; // connect north and south block sides facing east.
var VFT_SE_CORN = 3; // connect north and west block sides facing SE.
var VFT_S = 4; // connect east and west block sides facing south.
var VFT_SW_CORN = 5; // connect east and north block sides facing SW.
var VFT_W = 6; // connect south and north block sides facing west.
var VFT_NW_CORN = 7; // connect south and east block sides facing NW.
var VFT_N_CAPE = 8; // connect south and south facing north.
var VFT_E_CAPE = 9;
var VFT_S_CAPE = 10;
var VFT_W_CAPE = 11;
var VFT_ISLAND = 12;
var VFT_COUNT = 13;

function VoxFace(owningBlock, faceType) {
  this.block = owningBlock;
  this.faceType = faceType;

  // Next face on our floor, clockwise (NESW-style).  Always present after
  // floor slicing.
  this.nextFace = null;
  // Moving into the next face do we deflect off of a block?
  this.nextDeflected = false;
  // Previous face on our floor, anti-clockwise (NESW-style).  Always present
  // after floor slicing.
  this.prevFace = null;
  // Coming in from the previous face, was there a deflection off a block?
  this.prevDeflected = false;

  /* TODO
  // Any matching face (same faceType) for the floor above us, may stay null.
  this.upFace = null;
  // Any matching face (same faceType) for the floor below us, may stay null.
  this.downFace = null;
  */

  this.wallPlanner = null;
  this.wallData = null;
}
VoxFace.prototype = {
}

/**
 * A mapping from an adjacency bitmask to the list of VoxFace types that should
 * exist in that scenario.  Because we define voxfaces as a responsibility to
 * generate a continuous path to specific edge of the associated VoxBlock which
 * may involve corners/180-degree turns, the only time we'll have more than 1
 * is for parallel voxfaces.  These will always be parallel-ish [N,S] or [E,W]
 * pairs.  Something like a [NE,SW] pair is impossible because these are corners
 * and such a combination is what we define to be a VFT_ISLAND.
 *
 * Our adjacency bitmask is: north (1), east(2), south(4), west(8).
 *
 * Do not change the ordering of the E/W N/S pairs without updating
 * `_linkVoxFace`.
 */
var ADJ_TO_VFT_MAPPING = [
  [VFT_ISLAND], // nothing adjacent! island!
  [VFT_S_CAPE], // 1: just to the north, southern cape!
  [VFT_W_CAPE], // 2: just to the east, western cape
  [VFT_SW_CORN], // 3=1+2: to the north and the east, southwestern corner
  [VFT_N_CAPE], // 4: just to the south, northern cape
  [VFT_E, VFT_W], // 5=1+4: to the north and south, so west and east faces
  [VFT_NW_CORN], // 6=2+4: to the east and south, so northwestern corner
  [VFT_W], // 7=1+2+4: to the north and east and south, so west face.
  [VFT_E_CAPE], // 8: just to the west so eastern cape,
  [VFT_SE_CORN], // 9=1+8: to the north and west, so southeastern corner
  [VFT_N, VFT_S], // 10=2+8: to the east and west, so north and south faces
  [VFT_S], // 11=1+2+8: to the north and east and west, so south face
  [VFT_NE_CORN], // 12=4+8: to the south and west, so northeastern corner
  [VFT_E], // 13=1+4+8: to the north and south and west, so east face
  [VFT_N], // 14=2+4+8: to the east and south and west, so north face
  null // 15=1+2+4+8: all sides, no faces generated
];

// see VFT_CLOCKWISE_ENTRY_FACE_INDEX_MAPPING
var NE_ENTRY = 0;
var SE_ENTRY = 1;
var SW_ENTRY = 2;
var NW_ENTRY = 3;
var SELF_LOOP = 4;

/**
 * Maps from VoxFace type to the corner of entry into the next/adjacent block
 * from that block's perspective.  If there's a "deflection", then you need
 * to further map the entry through CLOCKWISE_ENTRY_CORNER_DEFLECT_ROTATE.
 */
var VFT_CLOCKWISE_ENTRY_FACE_INDEX_MAPPING = [
  // cardinal + corners
  NW_ENTRY, // N enters from the west to the north
  NE_ENTRY, // NE corner enters from the north to the east
  NE_ENTRY, // E enters from the north to the east
  SE_ENTRY, // SE corner enters from the east to the south
  SE_ENTRY, // S enters from the east to the south
  SW_ENTRY, // SW enters from the south to the west
  SW_ENTRY, // W enters frmo the south to the west
  NW_ENTRY, // NW enters from the west to the north
  // capes
  NE_ENTRY, // N cape enters from the north to the east
  SE_ENTRY, // E cape enters from the east to the south
  SW_ENTRY, // S cape enters from the south to the west
  NW_ENTRY, // W cape enters from the west to the north
  // island (is special) and omitted because you shouldn't ask.
];

/**
 * All clockwise entries are unambiguous because they're always left turns, so
 * we can trivially rotate them without direction.  Keep in mind we're
 * discussing _entry_ corners here, not exit corners.  Unlike some other
 * mappings that need to exist because of our value-space (ex: MA_U/MA_D), this
 * could be accomplished with math.
 */
var CLOCKWISE_ENTRY_CORNER_DEFLECT_ROTATE = [
  NW_ENTRY, // Our NE is our eastern neighbor's NW (0 => 3)
  NE_ENTRY, // Our SE is our southern neighbor's NE (1 => 0)
  SE_ENTRY, // Our SW is our western neighbor's SE (2 => 1)
  SW_ENTRY, // our NW is our norther neighbor's SW (3 => 2)
]

var VFT_CLOCKWISE_EXIT_DIR_MAPPING = [
  // cardinal + corners
  MA_E, // N exits east
  MA_S, // NE corner exits south
  MA_S, // E exits south
  MA_W, // SE corner exits west
  MA_W, // S exits west
  MA_N, // SW exits north
  MA_N, // W exits north
  MA_E, // NW corner exits east
  // capes
  MA_S, // N cape both enters and exits from the south
  MA_W, // E cape both enters and exits from the west
  MA_N, // S cape both enters and exits from the north
  MA_E, // W cape both enters and exits from the east
  // island (is special) and omitted because you shouldn't ask.
];

/**
 *
 */
function FloorSlicer(blockSpace) {
  this.space = blockSpace;
}
FloorSlicer.prototype = {
  sliceAllFloors: function() {
    this.space.determineGroups();

    for (var iGroup = 0; iGroup < this.space.groups2dByY.length; iGroup++) {
      var group2d = this.space.groups2dByY[iGroup];

      this._sliceGroup2d(group2d);
    }
  },

  /**
   * Using the ADJ_TO_VFT_MAPPING lookup table, create the (1 or 2) VoxFaces
   * for this block.  Linkage occurs in `_linkVoxFace`.
   */
  _createFacesForBlock: function(block) {
    // north (1), east (2), south (4), west (8)
    var adjacencyBits = (
     (block.adjacentBlocks[0] ? 1 : 0) |
     (block.adjacentBlocks[1] ? 2 : 0) |
     (block.adjacentBlocks[3] ? 4 : 0) |
     (block.adjacentBlocks[4] ? 8 : 0));

    var faceTypes = ADJ_TO_VFT_MAPPING[adjacencyBits];
    if (!faceTypes) {
      return;
    }

    var voxFaces = block.voxFaces = [];
    for (var iFaceType = 0; iFaceType < faceTypes.length; iFaceType++) {
      var faceType = faceTypes[iFaceType];

      var face = new VoxFace(block, faceType);
      voxFaces.push(face);
    }
  },

  /**
   * Given a starting face, establish the nextFace/prevFace links by walking in
   * clock-wise ("next") traversal order.  Returns the face to use as the
   * voxface to put in Group2d.startVoxFaces.  Right now that's just the first
   * face we're provided, but in the future we might want to adjust that for
   * some kind of consistency.
   *
   * All our VoxFaces are defined such that they notionally enter/exit a block
   * at a corner via a specific cardinal direction.  If we didn't have
   * internal blocks, it would be simple enough to figure out the adjacent block
   * we're traversing into and which of its (1 or 2) voxfaces the link should be
   * with based on those voxfaces' types.  However, we do have internal blocks
   * and they mean that we actually want to hang a 90-degree left when we hit
   * an internal block which means rotating things.
   */
  _linkVoxFace: function(firstFace) {
    var face = firstFace, nextFace;
    for (var face = firstFace, nextFace = null;
         nextFace != firstFace; face = nextFace) {
      var block = face.block;

      // Islands involve no traversal.
      if (face.faceType === VFT_ISLAND) {
        face.nextFace = face;
        face.prevFace = face;
        break;
      }

      var traverseDir = VFT_CLOCKWISE_EXIT_DIR_MAPPING[face.faceType];
      var nextBlock = block.adjacentBlocks[traverseDir];
      var entryCorner = VFT_CLOCKWISE_ENTRY_FACE_INDEX_MAPPING[face.faceType];
      var leftDir = MANHATTAN_LEFT_MAPPING[traverseDir];

      // Do we deflect off this block?  We do so if there's something in its
      // left direction.
      var leftBlock = nextBlock.adjacentBlocks[leftDir];
      var deflected;
      if (leftBlock) {
        // Then hang a left and traverse again.
        deflected = true;
        nextBlock = leftBlock;
        entryCorner = CLOCKWISE_ENTRY_CORNER_DEFLECT_ROTATE[entryCorner];
      } else {
        deflected = false;
      }

      var nextFaces = nextBlock.voxFaces;
      if (nextFaces.length > 1) {
        // There are multiple faces, we gotta pick 1 based on entry.  This
        // mapping assumes the current [E,W] and [N,S] orderings given to us by
        // ADJ_TO_VFT_MAPPING.  We could rearrange things to be able to play
        // bitmask games, but that won't make things more clear.
        switch (entryCorner) {
          case NE_ENTRY: // wants east (0)
          case NW_ENTRY: // wants north (0)
            nextFace = nextFaces[0];
            break;
          case SE_ENTRY: // wants south (1)
          case SW_ENTRY: // wants west (1)
            nextFace = nextFaces[1];
            break;
        }
      } else {
        nextFace = nextFaces[0];
      }

      face.nextFace = nextFace;
      face.nextDeflected = deflected;
      nextFace.prevFace = face;
      nextFace.prevDeflected = deflected;
    }

    return firstFace;
  },

  /**
   *
   * -
   */
  _sliceGroup2d: function(group) {
    // - Walk the blocks, creating their faces.
    for (var iBlock = 0; iBlock < group.blocks.length; iBlock++) {
      var block = group.blocks[iBlock];
      this._createFacesForBlock(block);
    }

    // - Re-walk, establishing the links.
    // (We could have done it in the prior pass except for the edge-case about
    // closure.  However, this also makes it easier for us to determine the
    // face-loops.  And with debugging factored in, it's easier this way.
    // That said, this could be optimized at some expense of clarity.)
    for (iBlock = 0; iBlock < group.blocks.length; iBlock++) {
      var block = group.blocks[iBlock];

      if (!block.voxFaces) {
        continue;
      }

      for (var iFace = 0; iFace < block.voxFaces.length; iFace++) {
        var face = block.voxFaces[iFace];

        // Not yet linked?
        if (!face.nextFace) {
          // Link its whose loop and add one of them to be a starting face.
          group.startVoxFaces.push(this._linkVoxFace(face));
        }
      }
    }

  }
};

module.exports = {
  FloorSlicer,
  VFT_N, VFT_NE_CORN, VFT_E, VFT_SE_CORN, VFT_S, VFT_SW_CORN, VFT_W,
  VFT_NW_CORN, VFT_N_CAPE, VFT_E_CAPE, VFT_S_CAPE, VFT_W_CAPE, VFT_ISLAND
};
