'use strict';

var {
  VFT_N, VFT_NE_CORN, VFT_E, VFT_SE_CORN, VFT_S, VFT_SW_CORN, VFT_W,
  VFT_NW_CORN, VFT_N_CAPE, VFT_E_CAPE, VFT_S_CAPE, VFT_W_CAPE, VFT_ISLAND
} = require('../floor_slicer');

/**
 *  For now just does right-angle walls.
 */
function BasicWallPlanner(inset) {
  this.inset = inset;
}
BasicWallPlanner.prototype = {
  /**
   * Given a voxface, generate the right-angle curves.  Each returned curve
   * is intended to be part of a logically distinct wall-planning curve segment
   * with the first and last curves merged with their neighbors.
   */
  _makeCurvesForFace: function(face) {
    // The inset is always positive, so:
    // z: -inset is moving north, +inset is moving south
    // x: -inset is moving west, +inset is moving east
    // So when manipulating:
    // nZ: + inset
    // eX: - inset
    // sZ: - inset
    // wX: + inset
    var inset = this.inset;
    var block = face.block;
    var p1, p2, p3, p4, p5;

    // opposite rules from inset; nZ:-, eX:+, sZ+, wX:-
    var inDeflect = face.prevDeflected ? inset : 0;
    var outDeflect = face.nextDeflected ? inset : 0;

    // For our 2d purposes, z is y, so Vector2(x, z)
    switch (face.faceType) {
      case VFT_N:
        p1 = new THREE.Vector2(block.wX - inDeflect, block.nZ + inset);
        p2 = new THREE.Vector2(block.eX + outDeflect, block.nZ + inset);
        break;

      case VFT_NE_CORN:
        p1 = new THREE.Vector2(block.wX - inDeflect, block.nZ + inset);
        p2 = new THREE.Vector2(block.eX - inset, block.nZ + inset);
        p3 = new THREE.Vector2(block.eX - inset, block.sZ + outDeflect);
        break;

      case VFT_E:
        p1 = new THREE.Vector2(block.eX - inset, block.nZ - inDeflect);
        p2 = new THREE.Vector2(block.eX - inset, block.sZ + outDeflect);
        break;

      case VFT_SE_CORN:
        p1 = new THREE.Vector2(block.eX - inset, block.nZ - inDeflect);
        p2 = new THREE.Vector2(block.eX - inset, block.sZ - inset);
        p3 = new THREE.Vector2(block.wX - outDeflect, block.sZ - inset);
        break;

      case VFT_S:
        p1 = new THREE.Vector2(block.eX + inDeflect, block.sZ - inset);
        p2 = new THREE.Vector2(block.wX - outDeflect, block.sZ - inset);
        break;

      case VFT_SW_CORN:
        p1 = new THREE.Vector2(block.eX + inDeflect, block.sZ - inset);
        p2 = new THREE.Vector2(block.wX + inset, block.sZ - inset);
        p3 = new THREE.Vector2(block.wX + inset, block.nZ - outDeflect);
        break;

      case VFT_W:
        p1 = new THREE.Vector2(block.wX + inset, block.sZ + inDeflect);
        p2 = new THREE.Vector2(block.wX + inset, block.nZ - outDeflect);
        break;

      case VFT_NW_CORN:
        p1 = new THREE.Vector2(block.wX + inset, block.sZ + inDeflect);
        p2 = new THREE.Vector2(block.wX + inset, block.nZ + inset);
        p3 = new THREE.Vector2(block.eX + outDeflect, block.nZ + inset);
        break;

      case VFT_N_CAPE:
        p1 = new THREE.Vector2(block.wX + inset, block.sZ + inDeflect);
        p2 = new THREE.Vector2(block.wX + inset, block.nZ + inset);
        p3 = new THREE.Vector2(block.eX - inset, block.nZ + inset);
        p4 = new THREE.Vector2(block.eX - inset, block.sZ + outDeflect);
        break;

      case VFT_E_CAPE:
        p1 = new THREE.Vector2(block.wX - inDeflect, block.nZ + inset);
        p2 = new THREE.Vector2(block.eX - inset, block.nZ + inset);
        p3 = new THREE.Vector2(block.eX - inset, block.sZ - inset);
        p4 = new THREE.Vector2(block.wX - outDeflect, block.sZ - inset);
        break;

      case VFT_S_CAPE:
        p1 = new THREE.Vector2(block.eX - inset, block.nZ - inDeflect);
        p2 = new THREE.Vector2(block.eX - inset, block.sZ - inset);
        p3 = new THREE.Vector2(block.wX + inset, block.sZ - inset);
        p4 = new THREE.Vector2(block.wX + inset, block.nZ - outDeflect);
        break;

      case VFT_W_CAPE:
        p1 = new THREE.Vector2(block.eX + inDeflect, block.sZ - inset);
        p2 = new THREE.Vector2(block.wX + inset, block.sZ - inset);
        p3 = new THREE.Vector2(block.wX + inset, block.nZ + inset);
        p4 = new THREE.Vector2(block.eX + outDeflect, block.nZ + inset);
        break;

      case VFT_ISLAND:
        p1 = new THREE.Vector2(block.wX + inset, block.nZ + inset);
        p2 = new THREE.Vector2(block.eX - inset, block.nZ + inset);
        p3 = new THREE.Vector2(block.eX - inset, block.sZ - inset);
        p4 = new THREE.Vector2(block.wX + inset, block.sZ - inset);
        p5 = p1;
        break;
    }

    var curves = [];
    curves.push(new THREE.LineCurve(p1, p2));
    if (p3) {
      curves.push(new THREE.LineCurve(p2, p3));
    }
    if (p4) {
      curves.push(new THREE.LineCurve(p3, p4));
    }
    if (p5) {
      curves.push(new THREE.LineCurve(p4, p5));
    }

    return curves;
  },

  /**
   * Produce WPSCPs (wall-planning segment curve pairs) for the given face.  For
   * now, our approach assumes right-angle walls with nothing fancier happening.
   * Every time we hit a corner, we terminate our existing WPSCP.  Our helper
   * _makeCurvesForFace generates an additional curve each time it hits another
   * right angle.  This results in the property that the first and last curves
   * in the array want to be part of the same WPSCP as their neighboring curves.
   * (This works for single-item arrays too.)
   */
  planRun: function(faces) {
    var segments = [];
    var segCurves = [];
    var segPointRanges = [];

    var face, startFace;
    var accumulateCurveLength = function(total, curve) {
      return total + curve.getLength();
    };
    var emitSegment = function() {
      var curSegment = {
        startFace: startFace,
        endFace: face,
        length: segCurves.reduce(accumulateCurveLength, 0),
        floorCurves: segCurves,
        ceilingCurves: segCurves,
        pointRanges: segPointRanges,
        objects: []
      };
      segments.push(curSegment);
      startFace = face;
      segCurves = [];
    };

    startFace = faces[0];
    for (var iFace = 0; iFace < faces.length; iFace++) {
      face = faces[iFace];
      var faceCurves = this._makeCurvesForFace(face);

      segCurves.push(faceCurves[0]);
      segPointRanges.push(2, 2);
      // Nothing special to do if this piece is continuous.
      if (faceCurves.length === 1) {
        continue;
      }
      var iCurve = 0;
      while (iCurve < faceCurves.length - 1) {
        emitSegment();
        iCurve++;
        segCurves.push(faceCurves[iCurve]);
        segPointRanges.push(2, 2);
      }
    }
    emitSegment();

    return segments;
  }
};

module.exports =  { BasicWallPlanner };
