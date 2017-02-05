
var EPSILON = 0.00001;

/**
 * Return true if the vertices in array A are pairwise strictly equal to those
 * in array B.
 */
function sameVerts(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (var iVert = 0; iVert < a.length; iVert++) {
    if (!a[iVert].equals(b[iVert])) {
      return false;
    }
  }
  return true;
}

/**
 * Segment-aware geometry helper.
 *
 * For geometry generation, we have 2 states:
 * 1. We're in a stretch of wall without any cuts in it.  We sample along the
 *    floor and ceiling curves and connect their equivalent t-parameters using
 *    whatever point density is desired.
 * 2. We're in a object cut.  The object's curves are what we sample over.
 *    The resulting x-values are translated into appropriate t-parameters for
 *    the floor and ceiling curves.  The point density is the max of what is
 *    requested by the object and the floor/ceiling.
 *
 *
 */
function WallGeometryHelper(space, geom) {
  this.space = space;
  this.geom = geom;
  // walls notionally half a foot thick.
  this.thickness = space.hUnit / 12;

  // current segment
  this.seg = null;
  // distance along the segment, bounded as [0, seg.length]
  this.distAlongSeg = 0;

  // current curve in the segment
  this.iCurve = 0;
  // Does this curve connect to another curve in our same segment?
  this.internalCurve = false;
  // length of this curve (arc matters)
  this.curveLength = 0;
  // [0, highCurveIndex] curve point index.
  this.iCurvePoint = 0;
  // One less than the number of curve points to emit.
  this.highCurveIndex = 0;
  // our total distance along this curve.
  this.distAlongCurve = 0;
  // The next distance along the curve to emit a set of vertices for this curve.
  // We will step to the (relative) smaller of this and `nextObjStepDist`.
  this.nextCurveStepDist = 0;

  // We are told about the object prior to stepping to it.  inObj is initially
  // false and the `nextObjStepDist` is set to the start of the object.
  this.inObj = false;
  this.obj = null;
  this.objLength = 0;
  // Distance along the object's length.  May be negative in cases where we
  // haven't yet reached the start of the object.
  this.distAlongObj = 0;
  // [0, objPoints] object point index.
  this.iObjPoint = 0;
  // number of points we're emitting for this object
  this.objPoints = 0;
  // The next distance along the object to emit a set of vertices.  We will step
  // to the (relative) smaller of this and `nextCurveStepDist`.
  this.nextObjStepDist = 0;

  this.lastVerts = null;
  this.lastVertIndices = null;
}
WallGeometryHelper.prototype = {
  _wrapVerticesToIndices: function(verts) {
    var gverts = this.geom.vertices;
    return verts.map(function(vert) {
      var idx = gverts.length;
      gverts.push(vert);
      return idx;
    });
  },

  /**
   * Creates appropriate Vector3 vertices for the outward face of the wall.
   */
  _makeVerticalVertices: function() {
    var someBlock = this.seg.startFace.block;
    var floorY = someBlock.floorY;
    var ceilY = someBlock.ceilY;

    var obj = this.inObj && this.obj;

    // The object cutter operates in a 2d space.  We map this space onto the
    // 3d strip defined by linking floorCurve(t) and ceilingCurve(t) where the
    // object cutter's x's become the t-parameter for their corresponding curve
    // and the y is the distance along the line connecting floorCurve(bottomX)
    // and floorCurve(topX).
    var effectiveBottomDist = this.distAlongCurve;
    var effectiveTopDist = this.distAlongCurve;
    var cutBottomPoint, cutTopPoint;
    if (obj) {
      cutBottomPoint = obj.bottomCurve.getPoint(this.distAlongObj / this.objLength);
      cutTopPoint = obj.topCurve.getPoint(this.distAlongObj / this.objLength);

      // The 'x' exists in distAlongSeg-space.  The curve is being evaluated
      // in its local distAlongCurve

      var objLength = obj.end - obj.start;
      effectiveBottomDist = this.curveLength * (cutBottomPoint.x + obj.start) / this.seg.length;
      effectiveTopDist = this.curveLength * (cutTopPoint.x + obj.start) / this.seg.length;
    }
    console.log('actual dist', this.distAlongCurve, 'effective', effectiveBottomDist, effectiveTopDist)

    var floorPoint = this.floorCurve.getPoint(effectiveBottomDist / this.curveLength);
    var floorVert = new THREE.Vector3(floorPoint.x, floorY, floorPoint.y);

    var ceilPoint = this.ceilingCurve.getPoint(effectiveTopDist / this.curveLength);
    var ceilVert = new THREE.Vector3(ceilPoint.x, ceilY, ceilPoint.y);

    if (obj) {
console.log('obj points', this.distAlongObj / this.objLength, cutBottomPoint, cutTopPoint);

      // for simplicity, we're pretending like t===x and only caring about the y
      // which we map onto the line between floorVert and ceilVert.
      var cutBottomVert = new THREE.Vector3();
      cutBottomVert.subVectors(ceilVert, floorVert);
      cutBottomVert.multiplyScalar(cutBottomPoint.y / this.space.vUnit);
      cutBottomVert.add(floorVert);

      var cutTopVert = new THREE.Vector3();
      cutTopVert.subVectors(ceilVert, floorVert);
      cutTopVert.multiplyScalar(cutTopPoint.y / this.space.vUnit);
      cutTopVert.add(floorVert);

      return [floorVert, cutBottomVert, cutTopVert, ceilVert];
    }

    return [floorVert, ceilVert];
  },

  /**
   * Output the outward-facing wall faces between the two vertical strips we
   * have.  The number of to/from vertices may not match if this is a transition
   * between a hole and solid stuff.
   *
   * TODO: In the future we want the wall to have thickness, with us producing
   * faces for the inside as well as the window "framing" of the cut.  Although
   * we can infer a normal from the faces and flip that to create an offset set
   * of vertices, that won't work as great for angled walls since the displaced
   * vertices along the normal wouldn't necessarily line up with the floor or
   * ceiling.  It might be better for us to have the wall planner emit internal
   * wall curves in addition to the exterior wall curves.  That's really just
   * a question of re-running with a greater inset with the difference being the
   * resulting wall thickness.
   */
  _emitFaces: function(fromVertIdxs, toVertIdxs) {
    var gfaces = this.geom.faces;
    if (fromVertIdxs.length === 2) {
      if (toVertIdxs.length === 2) {
        // No hole, just two faces.
        gfaces.push(new THREE.Face3(fromVertIdxs[0], fromVertIdxs[1],
                                    toVertIdxs[0]));
        gfaces.push(new THREE.Face3(fromVertIdxs[1],
                                    toVertIdxs[1], toVertIdxs[0]));
      } else {
        // Transitioning to hole.
        gfaces.push(new THREE.Face3(fromVertIdxs[0],
                                    toVertIdxs[1], toVertIdxs[0]));
        gfaces.push(new THREE.Face3(fromVertIdxs[0],
                                    toVertIdxs[2], toVertIdxs[1]));
        gfaces.push(new THREE.Face3(fromVertIdxs[0], fromVertIdxs[1],
                                    toVertIdxs[2]));
        gfaces.push(new THREE.Face3(fromVertIdxs[1],
                                    toVertIdxs[3], toVertIdxs[2]));
      }
    } else {
      if (toVertIdxs.length === 2) {
        // transitioning from hole.
        gfaces.push(new THREE.Face3(fromVertIdxs[0], fromVertIdxs[1],
                                    toVertIdxs[0]));
        gfaces.push(new THREE.Face3(fromVertIdxs[1], fromVertIdxs[2],
                                    toVertIdxs[0]));
        gfaces.push(new THREE.Face3(fromVertIdxs[2],
                                    toVertIdxs[1], toVertIdxs[0]));
        gfaces.push(new THREE.Face3(fromVertIdxs[2], fromVertIdxs[3],
                                    toVertIdxs[1]));
      } else {
        // window gap.
        gfaces.push(new THREE.Face3(fromVertIdxs[0], fromVertIdxs[1],
                                    toVertIdxs[0]));
        gfaces.push(new THREE.Face3(fromVertIdxs[1],
                                    toVertIdxs[1], toVertIdxs[0]));
        gfaces.push(new THREE.Face3(fromVertIdxs[2], fromVertIdxs[3],
                                    toVertIdxs[2]));
        gfaces.push(new THREE.Face3(fromVertIdxs[3],
                                    toVertIdxs[3], toVertIdxs[2]));
      }
    }
  },

  _verticalCheckpoint: function() {
    //console.log('vert checkpoint');
    var verts = this._makeVerticalVertices();
    var vertIdxs = this._wrapVerticesToIndices(verts);
    if (this.lastVerts) {
      // Ignore this call if the vertices are equivalent to what we already
      // know.  We expect this to happen at curve transitions because of our
      // explicit overlap.  Although I may put some smarts that assume they can
      // avoid the duplicate emit at that point, in which case an assertion
      // that performs a checkpoint and asserts sameVerts might be appropriate.
      if (sameVerts(this.lastVerts, verts)) {
        //console.log('  same verts!');
        return;
      }
      this._emitFaces(this.lastVertIndices, vertIdxs);
    }
    this.lastVerts = verts;
    this.lastVertIndices = vertIdxs;
  },

  /**
   * Advance along the current segment, emitting geometry as we go.  There are
   * three possible "steps" that we could take at any given point:
   * - The step to the requested target, ending the loop after we process that
   *   vertical checkpoint.
   * - The step to the next point to emit on the current curve.
   * - If there's an `obj`, the step to the next point on the obj.
   */
  _advanceToDist: function(target) {
    while (this.distAlongSeg + EPSILON < target) {
      var targStep = target - this.distAlongSeg;
      var curveStep = this.nextCurveStepDist - this.distAlongCurve;

      if (this.obj) {
        objStep = this.nextObjStepDist - this.distAlongObj;
      } else {
        // arbitrary large value.  doesn't matter.
        objStep = 10000;
      }

      // - Pick smallest step.
      step = Math.min(targStep, curveStep, objStep);

      // - Step
      this.distAlongSeg += step;
      this.distAlongCurve += step;
      if (this.obj) {
        this.distAlongObj += step;
      }

      // - Curve stepping
      // If curve step reached, set next step or advance to next curve.
      if (this.distAlongCurve >= this.nextCurveStepDist - EPSILON) {
        this.iCurvePoint++;
        // If this is an internal curve and our next point is our last point, we
        // want to jump to the start of the next curve because we require the
        // points to be the same.
        if (this.iCurvePoint + (this.internalCurve ? 1 : 0) > this.highCurveIndex) {
          this._startSegmentCurve(this.iCurve + 1);
        } else {
          this.nextCurveStepDist =
            this.curveLength * (this.iCurvePoint + 1) / this.highCurveIndex;
        }
      }

      // - Object stepping
      // If not in object, see if our step brought us to its start.
      if (!this.inObj) {
        if (this.obj && this.distAlongObj >= -EPSILON) {
          this.inObj = true;
          this.distAlongObj = 0;
          this.iObjPoint = 0;
          this.nextObjStepDist = this.objLength / (this.objPoints - 1);
        } // otherwise we still didn't step to the object yet.
      }
      // In object, see if step reached, advance.  (We don't need to think about
      // doing anything special when we reach the end of the object.  Our caller
      // explicitly requested to advance to the end of the object and the loop
      // will terminate at that point.)
      else if (this.distAlongObj >= this.nextObjStepDist - EPSILON) {
        // (we were already in the object)
        this.iObjPoint++;
        this.nextObjStepDist =
          this.objLength * (this.iObjPoint + 1) / (this.objPoints - 1);
      }

      this._verticalCheckpoint();
    }
  },

  /**
   * Tell us about a segment.  We will emit the vertical vertices for the start.
   * This should be followed by calls for traverseCut for every (placed cut)
   * object and finally finished with a call to endSegment.
   */
  startSegment: function(seg) {
    this.lastVerts = null;
    this.seg = seg;
    this.distAlongSeg = 0;
    this._startSegmentCurve(0);
    this._verticalCheckpoint();
  },

  /**
   * Initialize for curves[iCurve].
   */
  _startSegmentCurve: function(iCurve) {
    this.floorCurve = this.seg.floorCurves[iCurve];
    this.ceilingCurve = this.seg.ceilingCurves[iCurve];

    this.iCurve = iCurve;
    this.internalCurve = iCurve < this.seg.floorCurves.length - 1;
    this.curveLength = this.floorCurve.getLength();
    this.iCurvePoint = 0;
    this.highCurveIndex = this.seg.pointRanges[iCurve * 2] + 1; // just use min for now
    this.nextCurveStepDist = this.curveLength / this.highCurveIndex;
    this.distAlongCurve = 0;
  },

  /**
   * Tell us about an object (with cuts).  We will update our state, then
   * advance to the end of the object, emitting as we go.
   *
   * If this is the first object on the segment, we expect our steps to be:
   * - The wall steps to bring us to the start of the object.  For 2-point
   *   walls, if the object happens in the first curve,
   *
   */
  traverseCut: function(obj) {
    console.log('new obj', obj);
    this.obj = obj;
    this.objLength = obj.end - obj.start;
    // this must be negative for correctness
    this.distAlongObj = this.distAlongCurve - obj.start;
    if (this.distAlongObj >= 0) {
      throw new Error('attempting to traverse cut too late. distAlongObj: ' +
        this.distAlongObj);
    }
    this.inObj = false;
    this.objPoints = obj.minPoints;
    this.iObjPoint = -1;
    // we want to step to the start of the object
    this.nextObjStepDist = 0;

    this._advanceToDist(obj.end);
    this.obj = null;
    this.inObj = false;
  },

  endSegment: function(seg) {
    this._advanceToDist(this.seg.length);
  }
};

/**
 * Covered by
 */
function HoleCuttingRenderer(space) {
  this.space = space;
}
HoleCuttingRenderer.prototype = {
  _renderSegment: function(wgeom, seg) {
    wgeom.startSegment(seg);
    for (var iObj = 0; iObj < seg.objects.length; iObj++) {
      var obj = seg.objects[iObj];
      wgeom.traverseCut(obj);
    }
    wgeom.endSegment(seg);
  },

  render: function() {
    var geometry = new THREE.Geometry();
    var wgeom = new WallGeometryHelper(this.space, geometry);

    var space = this.space;
    for (var iGroup = 0; iGroup < space.groups2dByY.length; iGroup++) {
      var group2d = space.groups2dByY[iGroup];
      var floorY = group2d.blocks[0].floorY;

      for (var iSeg = 0; iSeg < group2d.segments.length; iSeg++) {
        var seg = group2d.segments[iSeg];

        //console.log('rendering segment', seg);
        this._renderSegment(wgeom, seg);
      }
    }

    //console.log('my geometry has', geometry.vertices.length, 'vertices!',
    //            geometry.faces.length, 'faces!');

    geometry.computeBoundingSphere();
    geometry.computeFaceNormals();
    geometry.computeVertexNormals();
    return geometry;
  }
};

module.exports = { HoleCuttingRenderer };
