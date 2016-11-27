
/**
 * VoxFace types.
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
  // Previous face on our floor, anti-clockwise (NESW-style).  Always present
  // after floor slicing.
  this.prevFace = null;

  // Any matching face (same faceType) for the floor above us, may stay null.
  this.upFace = null;
  // Any matching face (same faceType) for the floor below us, may stay null.
  this.downFace = null;
}
VoxFace.prototype = {

}

/**
 * A mapping from an adjacency bitmask to the list of voxface types that should
 * exist in that scenario.  Our adjacency bitmask is: north (1), east(2),
 * south(4), west(8).
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
  null // 15=1+2+4+8: all sides, no faces generated and should never be indexed.
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

  _createFacesForBlock: function(block) {
    // north (1), east (2), south (4), west (8)
    var adjacencyBits = (
     (block.adjacentBlocks[0] ? 1 : 0) |
     (block.adjacentBlocks[1] ? 2 : 0) |
     (block.adjacentBlocks[3] ? 4 : 0) |
     (block.adjacentBlocks[4] ? 8 : 0));

    var faceTypes = ADJ_TO_VFT_MAPPING[adjacencyBits];
  },

  /**
   *
   * -
   */
  _sliceGroup2d: function(group) {
    // - Walk the blocks, creating their faces.
    for (var iBlock = 0; iBlock < group.blocks.length; iBlock++) {
      var block = group.blocks[iBlock];
      // Internal (2d) blocks have no faces!
      if (!block.isInternal2d) {
        this._createFacesForBlock(block);
      }
    }
    // - Re-walk, establishing the links.
    // (We could have done it in the prior pass except for the edge-case about
    // closure; with debugging factored in, it's easier this way.)
  }
};
