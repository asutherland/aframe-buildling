var coordinates = AFRAME.utils.coordinates;

/**
 * Our Manhattan-adjacency index mapping informed by the THREE.js XZ ground
 * plane where +Z is coming at the camera and +X goes off to the right.  With
 * our camera offset up (+Y), then we declare north to be -z, east to be +x,
 * and up to be +y.
 */
var indexToRelManhattan = [
  { x: 0, y: 0, z: -1 }, // 0: north. (3+3)%6
  { x: 1, y: 0, z: 0 }, // 1: east. (4+3)%6
  { x: 0, y: 1, z: 0 }, // 2: up. (5+3)%6
  { x: 0, y: 0, z: 1 }, // 3: south. (0+3)%6
  { x: -1, y: 0, z: 0 }, // 4: west. (1+3)%6
  { x: 0, y: -1, z: 0 }, // 5: down. (2+3)%6
];
var MANHATTAN_DIRS = 6;
var MA_N = 0; // north
var MA_E = 1; // east
var MA_U = 2; // up
var MA_S = 3; // south
var MA_W = 4; // west
var MA_D = 5; // down

/**
 * If we hang a left in this manhattan cardinal direction space, what's our new
 * direction?
 */
var MANHATTAN_LEFT_MAPPING = [
  MA_W, // north turns west
  MA_N, // east turns north
  MA_U, // left-up is still up
  MA_E, // south turns east
  MA_S, // west turns south
  MA_D, // left-down is still down.
];

/**
 * Convert relative (Manhattan as in no-diagonals), coordinates to its adjacency
 * index.
 */
function relManhattanToIndex(x, y, z) {
  if (z === -1) {
    return 0;
  }
  if (x === 1) {
    return 1;
  }
  if (y === 1) {
    return 2;
  }
  if (z === 1) {
    return 3;
  }
  if (x === -1) {
    return 4;
  }
  if (y === -1) {
    return 5;
  }
  // Make this function type-stable by always returning an in-range value.
  // At least, once we
  return 0;
}

/**
 * Represents a single Voxel Block and manhattan adjacency links.
 */
function VoxBlock(coord, coordStr, adjacentBlocks) {
  // { x, y, z } coord
  this.coord = coord;
  // stringified coord that's the key to the map we live in.
  this.coordStr = coordStr;

  // north z-boundary
  this.nZ = 0;
  // east x-boundary
  this.eX = 0;
  // south z-boundary
  this.sZ = 0;
  // west x-boundary
  this.wX = 0;
  // floor y-boundary
  this.floorY = 0;
  // ceiling y-boundary
  this.ceilY = 0;

  // north, east, up, south, west, down
  this.adjacentBlocks = adjacentBlocks;

  // Group identifier for blocks as connected in 3d.  If you follow the
  // adjacentBlocks graph, all reachable blocks will have this same non-zero id.
  // And no other blocks in the same block space will have the same id.
  // The value is 0 until initialized.
  this.group3d = null;
  // Group identifier for blocks as connected horizontally in 2d.  If you follow
  // the north/south/east/west adjacentBlocks indices, then all reachable blocks
  // will have this same non-zero id.  And no other blocks in the same block
  // space will have the same id.
  this.group2d = null;

  // Array of VoxFaces associated with this block.  null if isInternal2d.
  // Otherwise there will be between 1 and 4 of these.
  this.voxFaces = null;
}
VoxBlock.prototype = {
  /**
   * Is this block fully surrounded in 3d manhattan space by neighbors?
   */
  get isInternal3d() {
    return (
      this.adjacentBlocks[0] != null &&
      this.adjacentBlocks[1] != null &&
      this.adjacentBlocks[2] != null &&
      this.adjacentBlocks[3] != null &&
      this.adjacentBlocks[4] != null &&
      this.adjacentBlocks[5] != null
    );
  },

  /**
   * Is this block fully surrounded in 2d manhattan space by neighbors?
   */
  get isInternal2d() {
    return (
      this.adjacentBlocks[0] != null &&
      this.adjacentBlocks[1] != null &&
      this.adjacentBlocks[3] != null &&
      this.adjacentBlocks[4] != null
    );
  }
};

function Group3d(id) {
  this.id = id;
  this.blocks = [];
}
Group3d.prototype = {
};

function Group2d(id, y) {
  this.id = id;
  this.y = y;
  this.blocks = [];
  /**
   * List of (arbitrary) initial voxfaces for (closed) face-loop traversals.
   * Each "courtyard" (fully enclosed void) will result in an an extra
   * face-loop.
   */
  this.startVoxFaces = [];
  /**
   * Array of wall-planning segment curve pairs.  ("wpscps" is not a good
   * variable name.)
   */
  this.segments = null;
}
Group2d.prototype = {
};

/**
 * 3-dimensional block space.  As you add blocks it incrementally builds
 * adjacency relationships.
 *
 * All implementation choices assume we're being used for a reasonably small
 * number of blocks that are largely connected.
 */
function VoxBlockSpace(hUnit, vUnit) {
  /**
   * A mapping from coordinate-triple string to VoxBlock instance.  While
   * simplistic, our needs are simple too.
   */
  this._coordStrToBlock = new Map();

  this.hUnit = hUnit;
  this.vUnit = vUnit;

  this.groups3d = []; // index is id
  this.groups2d = []; // index is id
  this.groups2dByY = []; // just sorted from min-y to max-y
}
VoxBlockSpace.prototype = {
  /**
   * Convert an {x,y,z} coordinate triple to our keying string.  This may use
   * object-identity caching to provide limited locality speed-ups.
   */
  _makeCoordString: function(coord) {
    return coordinates.stringify(coord);
  },

  getExistingBlock: function(x, y, z) {
    var coordStr;
    if (arguments.length === 3) {
      coordStr = x + ' ' + y + ' ' + z;
    } else {
      coordStr = this._makeCoordString(coord);
    }
    return this._coordStrToBlock.get(coordStr);
  },

  getOrCreateBlock: function(coord) {
    var coordStr = this._makeCoordString(coord);
    var block = this._coordStrToBlock.get(coordStr);
    if (block) {
      return block;
    }

    // create the block
    block = new VoxBlock(
      coord, coordStr,
      // north, east, up south, west, down
      [
        this.getExistingBlock(coord.x, coord.y, coord.z + 1),
        this.getExistingBlock(coord.x + 1, coord.y, coord.z),
        this.getExistingBlock(coord.x, coord.y + 1, coord.z),
        this.getExistingBlock(coord.x, coord.y, coord.z - 1),
        this.getExistingBlock(coord.x - 1, coord.y, coord.z),
        this.getExistingBlock(coord.x, coord.y - 1, coord.z)
      ]
    );
    var hUnit = this.hUnit, hHalfUnit = hUnit/2;
    var vUnit = this.vUnit;
    block.nZ = -hHalfUnit - hUnit * coord.z;
    block.sZ = hHalfUnit - hUnit * coord.z;
    block.eX = hHalfUnit + hUnit * coord.x;
    block.wX = -hHalfUnit + hUnit * coord.x;
    block.floorY = vUnit * coord.y;
    block.ceilY = vUnit + vUnit * coord.y;

    var adjacencies = block.adjacentBlocks;
    // establish reciprocal adjacencies
    for (var adj=0; adj < 6; adj++) {
      var reverseAdj = (adj + 3) % 6;
      var other = adjacencies[adj];
      if (!other) {
        continue;
      }
      if (other.adjacentBlocks[reverseAdj]) {
        throw new Error('trying to clobber existing?!');
      }
      other.adjacentBlocks[reverseAdj] = block;
    }

    this._coordStrToBlock.set(coordStr, block);
  },

  _newGroup3d: function() {
    var group = new Group3d(this.groups3d.length + 1);
    this.groups3d.push(group);
    return group;
  },

  _newGroup2d: function(y) {
    var group = new Group2d(this.groups2d.length + 1, y);
    this.groups2d.push(group);
    return group;
  },

  /**
   * Simple non-recursive group flooding.
   */
  _flood3dGroup: function(rootBlock, group3d) {
    rootBlock.group3d = group3d;
    group3d.blocks.push(rootBlock);

    // Invariant: any block with the group set has also had its adjacent blocks
    // pushed onto pending.  Therefore if we see a block with the group set,
    // we know we don't have anything to do.  Likewise, if the group has not
    // been set, we need to set and push its adjacents.
    var pending = rootBlock.adjacentBlocks.concat();

    while (pending.length) {
      var block = pending.pop();
      // to simplify logic, we may push nulls. skip them here.
      if (!block) {
        continue;
      }

      // per invariant above, nothing to do here.
      if (block.group3d) {
        continue;
      }

      block.group3d = group3d;
      group3d.blocks.push(block);
      pending.push(
        block.adjacentBlocks[0], block.adjacentBlocks[1],
        block.adjacentBlocks[2], block.adjacentBlocks[3],
        block.adjacentBlocks[4], block.adjacentBlocks[5]);
    }
  },

  _flood2dGroup: function(rootBlock, group2d) {
    rootBlock.group2d = group2d;
    group2d.blocks.push(rootBlock);
    // Invariant: any block with the group set has also had its adjacent blocks
    // pushed onto pending.  Therefore if we see a block with the group set,
    // we know we don't have anything to do.  Likewise, if the group has not
    // been set, we need to set and push its adjacents.
    var pending = rootBlock.adjacentBlocks.concat();

    while (pending.length) {
      var block = pending.pop();
      // to simplify logic, we may push nulls. skip them here.
      if (!block) {
        continue;
      }
      // per invariant above, nothing to do here.
      if (block.group2d) {
        continue;
      }
      block.group2d = group2d;
      group2d.blocks.push(block);
      pending.push(
        block.adjacentBlocks[0], block.adjacentBlocks[1],
        block.adjacentBlocks[3], block.adjacentBlocks[4]);
    }
  },

  /**
   * For use when you're done adding voxel blocks, walk all blocks, create and
   * flood-fill groups so that the VoxBlock group3d and group2d properties are
   * populated.  After calling, groups3d, groups2d, and groups2dByY are usable.
   * Do not add blocks after invoking!
   */
  determineGroups: function() {
    if (this.groups3d.length) {
      throw new Error("already initialized!");
    }

    var blocks = Array.from(this._coordStrToBlock.values());
    for (var iBlock = 0; iBlock < blocks.length; iBlock++) {
      var block = blocks[iBlock];
      if (!block.group3d) {
        var group3d = this._newGroup3d();
        this._flood3dGroup(block, group3d);
      }

      if (!block.group2d) {
        var group2d = this._newGroup2d(block.y);
        this._flood2dGroup(block, group2d);
      }
    }

    this.groups2dByY = this.groups2d.concat();
    this.groups2dByY.sort(function(a, b) {
      return a.y - b.y;
    });
  },


};

module.exports = {
  VoxBlock, VoxBlockSpace,
  MA_N, MA_E, MA_U, MA_S, MA_W, MA_D,
  MANHATTAN_LEFT_MAPPING
};
