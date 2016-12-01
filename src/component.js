require('./vox_blocks');
require('./floor_slicer');
require('./plan_faces');
require('./plan_walls');

var coordinates = AFRAME.utils.coordinates;

var coordParser = function (value) {
  return value.split(',').map(coordinates.parse);
};
var coordStringifier = function (data) {
  return data.map(coordinates.stringify).join(',');
};

/**
 * Very trivial string parser so we can sketch out a floor plan in ASCII and
 * convert it into a blocks list without thinking too much.  The basic idea
 * is that you use backticks to create a multi-line string, "."s to indicate
 * a block, " " to indicate absence of a block, and "|" to delimit floors.  The
 * effectively enforced backtick concention is that you start it in column 0
 * and that every line after the first is indented by a space.
 *
 * As we move from left to right, we move along the x-axis.  As we move from
 * line to line, we move along the z-axis.  Each floor moves along the y-axis.
 * We assume you want the building centered on the x and z axes as much as
 * possible.  If you use an even number of blocks in either direction, you get
 * biased in the negative x/z directions.
 */
function asciiArtToBlockCoordMaps(str) {
  var lines = str.split('\n');

  var xDim = str.indexOf('|');
  if (xDim === -1) {
    xDim = str.indexOf('\n');
  }
  var xStart = -Math.floor(xDim/2);

  var yStart = 0; // no basements for now

  var zDim = lines.length;
  var zStart = -Math.floor(zDim/2);

  var blocks = [];
  var x = xStart;
  var y = yStart;
  var z = zStart;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    switch (c) {
      case 20: // whitespace => no block, +x
        x++;
        break;
      case 46: // dot => emit block, +x
        blocks.push({ x: x, y: y, z: z }); // (don't use cool syntax)
        x++;
        break;
      case 124: // pipe => reset x, +y
        x = xStart;
        y++;
        break;
      case 10: // newline => eat one indenting space, reset x, reset y, +z
        i++; // eat the first space of the next line that's an indent artifact
        x = xStart;
        y = yStart;
        z++;
        break;
    }
  }

  return blocks;
}

var pyramidHouseBlocks = asciiArtToBlockCoordMaps(
`...| . |
 ...|...| .
 ...| . |`);

AFRAME.registerComponent('buildling', {
  schema: {
    color: { default: '#ccc' },
    blocks: {
      default: pyramidHouseBlocks,
      parse: coordParser,
      stringify: coordStringifier,
    },
    /*
    doors: {
      default: [
        { x: 0, y: 0, z: 1 },
      ],
      parse: coordParser,
      stringify: coordStringifier,
    },
    */
    hScale: {
      default: 0.1
    },
    vScale: {
      default: 0.2
    }
  },

  update: function () {
    var hUnit = this.data.hSize / 5;
    var vUnit = this.data.vSize / 10;

    var blockSpace = new VoxBlockSpace(hUnit, vUnit);
    this.data.blocks.forEach(function(coord) {
      blockSpace.getOrCreateBlock(coord);
    });

    var floorSlicer = new FloorSlicer(blockSpace);
    floorSlicer.sliceAllFloors();

    planFaces(blockSpace);
    planWalls(blockSpace);

    var geometry = renderDebugFloorLineMesh(blockSpace);

    var material = new THREE.LineBasicMaterial({
	      color: this.data.color
    });


    this.el.setObject3D('mesh', new THREE.Line(geometry, material));
  },

  remove: function () {
    this.el.removeObject3D('mesh');
  }
});
