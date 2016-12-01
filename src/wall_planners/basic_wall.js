
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
    var inset = this.inset;
    var block = face.block;
    var p1, p2, p3, p4, p5;

    // For our 2d purposes, z is y, so Vector2(x, z)
    switch (face.faceType) {
      case VFT_N:
        p1 = new THREE.Vector2(block.wX, block.nZ - inset);
        p2 = new THREE.Vector2(block.eX, block.nZ - inset);
        break;

      case VFT_NE_CORN:
        p1 = new THREE.Vector2(block.wX, block.nZ - inset);
        p2 = new THREE.Vector2(block.eX - inset, block.nZ - inset);
        p3 = new THREE.Vector2(block.eX - inset, block.sZ);
        break;

      case VFT_E:
        p1 = new THREE.Vector2(block.eX - inset, block.nZ);
        p2 = new THREE.Vector2(block.eX - inset, block.sZ);
        break;

      case VFT_SE_CORN:
        p1 = new THREE.Vector2(block.eX - inset, block.nZ);
        p2 = new THREE.Vector2(block.eX - inset, block.sZ - inset);
        p3 = new THREE.Vector2(block.wX, block.sZ - inset);
        break;

      case VFT_S:
        p1 = new THREE.Vector2(block.eX, block.sZ - inset);
        p2 = new THREE.Vector2(block.wX, block.sZ - inset);
        break;

      case VFT_SW_CORN:
        p1 = new THREE.Vector2(block.eX, block.sZ - inset);
        p2 = new THREE.Vector2(block.wX - inset, block.sZ - inset);
        p3 = new THREE.Vector2(block.wX - inset, block.nZ);
        break;

      case VFT_W:
        p1 = new THREE.Vector2(block.wX - inset, block.sZ);
        p2 = new THREE.Vector2(block.wX - inset, block.nZ);
        break;

      case VFT_NW_CORN:
        p1 = new THREE.Vector2(block.wX - inset, block.sZ);
        p2 = new THREE.Vector2(block.wX - inset, block.nZ - inset);
        p3 = new THREE.Vector2(block.eX, block.nZ - inset);
        break;

      case VFT_N_CAPE:
        p1 = new THREE.Vector2(block.wX - inset, block.sZ);
        p2 = new THREE.Vector2(block.wX - inset, block.nZ - inset);
        p3 = new THREE.Vector2(block.eX - inset, block.nZ - inset);
        p4 = new THREE.Vector2(block.eX - inset, block.sZ);
        break;

      case VFT_E_CAPE:
        p1 = new THREE.Vector2(block.wX, block.nZ - inset);
        p2 = new THREE.Vector2(block.eX - inset, block.nZ - inset);
        p3 = new THREE.Vector2(block.eX - inset, block.sZ - inset);
        p4 = new THREE.Vector2(block.wX, block.sZ - inset);
        break;

      case VFT_S_CAPE:
        p1 = new THREE.Vector2(block.eX - inset, block.nZ);
        p2 = new THREE.Vector2(block.eX - inset, block.sZ - inset);
        p3 = new THREE.Vector2(block.wX - inset, block.sZ - inset);
        p4 = new THREE.Vector2(block.wX - inset, block.nZ);
        break;

      case VFT_W_CAPE:
        p1 = new THREE.Vector2(block.eX, block.sZ - inset);
        p2 = new THREE.Vector2(block.wX - inset, block.sZ - inset);
        p3 = new THREE.Vector2(block.wX - inset, block.nZ - inset);
        p4 = new THREE.Vector2(block.eX, block.nZ - inset);
        break;

      case VFT_ISLAND:
        p1 = new THREE.Vector2(block.wX - inset, block.nZ - inset);
        p2 = new THREE.Vector2(block.eX - inset, block.nZ - inset);
        p3 = new THREE.Vector2(block.eX - inset, block.sZ - inset);
        p4 = new THREE.Vector2(block.wX - inset, block.sZ - inset);
        p5 = p1;
        break;
    }

    var curves = [];
    curves.push(new LineCurve(p1, p2));
    if (p3) {
      curves.push(new LineCurve(p2, p3));
    }
    if (p4) {
      curves.push(new LineCurve(p3, p4));
    }
    if (p5) {
      curves.push(new LineCurve(p4, p5));
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
    var emitSegment = function() {
      var curSegment = {
        startFace: startFace,
        endFace: face,
        floorCurves: segCurves,
        ceilingCurves: segCurves,
        pointRanges: segPointRanges
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
        segCurves.push(curves[iCurve]);
        segPointRanges.push(2, 2);
      }
    }
    emitSegment();

    return segments;
  }
};
