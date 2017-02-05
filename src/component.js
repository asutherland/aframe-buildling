'use strict';

var { VoxBlockSpace } = require('./vox_blocks');
var { FloorSlicer } = require('./floor_slicer');
var { planFaces } = require('./plan_faces');
var { planWalls } = require('./plan_walls');

var { renderDebugFloorLineMesh } = require('./debug_renderer');

var { placeObjects } = require('./place_objects');
var { HoleCuttingRenderer } = require('./wall_renderers/hole_cutting');

var coordinates = AFRAME.utils.coordinates;

var coordParser = function (value) {
  if (Array.isArray(value)) {
    return value;
  }
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
  //console.log('ground floor upper left', x, y, z);
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    switch (c) {
      case 32: // whitespace => no block, +x
        //console.log('whitespace', x, y, z);
        x++;
        break;
      case 46: // dot => emit block, +x
        //console.log('dot', x, y, z);
        blocks.push({ x, y, z });
        x++;
        break;
      case 124: // pipe => reset x, +y
        x = xStart;
        y++;
        //console.log('pipe, now', x, y, z);
        break;
      case 10: // newline => eat one indenting space, reset x, reset y, +z
        i++; // eat the first space of the next line that's an indent artifact
        x = xStart;
        y = yStart;
        z++;
        //console.log('newline, now', x, y, z);
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
      default: 0.6
    },
    vScale: {
      default: 0.8
    }
  },

  init: function() {

  },

  update: function () {
    var hUnit = this.data.hScale;// / 5;
    var vUnit = this.data.vScale;// / 10;

    var blockSpace = new VoxBlockSpace(hUnit, vUnit);
    this.data.blocks.forEach(function(coord) {
      blockSpace.getOrCreateBlock(coord);
    });

    var floorSlicer = new FloorSlicer(blockSpace);
    floorSlicer.sliceAllFloors();

    planFaces(blockSpace);
    planWalls(blockSpace);

    var debugMode = false;
    var wireframeMode = true;

    var geometry, material;
    if (debugMode) {
      geometry = renderDebugFloorLineMesh(blockSpace);
      material = new THREE.LineBasicMaterial({
  	      color: this.data.color
      });

      this.el.setObject3D('mesh', new THREE.Line(geometry, material));
    } else {
      placeObjects(blockSpace);

      var wallRenderer = new HoleCuttingRenderer(blockSpace);
      geometry = wallRenderer.render();

      material = new THREE.MeshStandardMaterial({
        color: this.data.color,
        wireframe: wireframeMode
      });

      this.el.setObject3D('mesh', new THREE.Mesh(geometry, material));
    }

    console.log('rendered space:', blockSpace);
  },

  remove: function () {
    this.el.removeObject3D('mesh');
  }
});

/**
 * <a-mountain>
 */
AFRAME.registerPrimitive('a-buildling', {
  defaultComponents: {
    buildling: {}
  },

  mappings: {
    color: 'buildling.color',
    blocks: 'buildling.blocks',
    hScale: 'buildling.hScale',
    vScale: 'buildling.vScale',
  }
});
