
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
  // length of this curve (arc matters)
  this.curveLength = 0;
  // [0, curvePoints] curve point index.
  this.iCurvePoint = 0;
  // number of points we're emitting for this curve.
  this.curvePoints = 0;
  // our total distance along this curve.
  this.distAlongCurve = 0;
  this.nextCurveStepDist = 0;

  this.obj = null;
  this.objLength = 0;
  this.distAlongObj = 0;
  this.iObjPoint = 0;
  this.objPoints = 0;
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

    var floorPoint = this.floorCurve.getPoint(this.distAlongCurve / this.curveLength);
    var floorVert = new THREE.Vector3(floorPoint.x, floorY, floorPoint.y);

    var ceilPoint = this.ceilingCurve.getPoint(this.distAlongCurve / this.curveLength);
    var ceilVert = new THREE.Vector3(ceilPoint.x, ceilY, ceilPoint.y);

    var obj = this.obj;
    if (obj) {
      var cutBottomPoint = obj.bottomCurve.getPoint(this.distAlongObj / this.objLength);
      var cutTopPoint = obj.topCurve.getPoint(this.distAlongObj / this.objLength);

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
    console.log('vert checkpoint');
    var verts = this._makeVerticalVertices();
    var vertIdxs = this._wrapVerticesToIndices(verts);
    if (this.lastVerts) {
      // Ignore this call if the vertices are equivalent to what we already
      // know.  We expect this to happen at curve transitions because of our
      // explicit overlap.  Although I may put some smarts that assume they can
      // avoid the duplicate emit at that point, in which case an assertion
      // that performs a checkpoint and asserts sameVerts might be appropriate.
      if (sameVerts(this.lastVerts, verts)) {
        console.log('  same verts!');
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
   * - The step to the requested target.  This should be the end of
   * - The step to the next point to emit on the current curve.
   * - If there's an `obj`, the step to the next point on the obj.
   */
  _advanceToDist: function(target) {
    while (this.distAlongSeg + EPSILON < target) {
      var targStep = target - this.distAlongSeg;
      var curveStep = this.nextCurveStepDist - this.distAlongCurve;
      var objStep;
      // XXX okay, this and the emitter needs to be specialized to understand
      // if we're in the object yet or not.  I initially wrote this assuming
      // we'd have advanced to the object start before applying the object.  But
      // it is the case we want to know about the object to start its opening
      // before advancing to that transition point.  In the case the object is
      // not the cause of the immediate next step, then we need to make sure
      // it's predicated.  We mainly want the object putting forth steps like:
      // [start], [...all the steps called for by the object's count...], [end].
      if (this.obj) {

        objStep = this.nextObjStepDist - this.distAlongObj;
      } else {
        // arbitrary large value.  doesn't matter.
        objStep = 10000;
      }

      step = Math.min(targStep, curveStep, objStep);
      console.log('distAlongSeg', this.distAlongSeg, 'step', step);
      this.distAlongSeg += step;
      this.distAlongCurve += step;
      this.distAlongObj += step;

      if (this.distAlongCurve >= this.nextCurveStepDist - EPSILON) {
        this.iCurvePoint++;
        if (this.iCurvePoint > this.curvePoints) {
          this._startSegmentCurve(this.iCurve + 1);
        } else {
          this.nextCurveStepDist =
            this.curveLength * (this.iCurvePoint + 1) / (this.curvePoints - 1);
        }
      }
      if (this.distAlongObj >= this.nextObjStepDist - EPSILON) {
        this.iObjPoint++;
        this.nextObjStepDist =
          this.objLength * (this.iObjPoint + 1) / (this.objPoints - 1);
      }

      this._verticalCheckpoint();
    }
    console.log('advanced', this.distAlongSeg, 'target', target, 'of', this.seg.length);
  },

  /**
   * Tell us about a segment.  We will emit the vertical vertices for the start.
   */
  startSegment: function(seg) {
    this.lastVerts = null;
    this.seg = seg;
    this.distAlongSeg = 0;
    this._startSegmentCurve(0);
    this._verticalCheckpoint();
  },

  _startSegmentCurve: function(iCurve) {
    this.floorCurve = this.seg.floorCurves[iCurve];
    this.ceilingCurve = this.seg.ceilingCurves[iCurve];

    this.iCurve = iCurve;
    this.curveLength = this.floorCurve.getLength();
    console.log('curve length:', this.curveLength);
    this.iCurvePoint = 0;
    this.curvePoints = this.seg.pointRanges[iCurve * 2]; // just use min for now
    this.nextCurveStepDist = this.curveLength / (this.curvePoints - 1);
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
    this.obj = obj;
    this.objLength = obj.end - obj.start;
    this.distAlongObj = 0;
    this.iObjPoint = 0;
    this.objPoints = obj.minPoints;
    this.nextObjStepDist = this.objLength / (this.objPoints - 1);

    this._advanceToDist(obj.end);
    this.obj = null;
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

        this._renderSegment(wgeom, seg);
      }
    }

    console.log('my geometry has', geometry.vertices.length, 'vertices!',
                geometry.faces.length, 'faces!');

    geometry.computeBoundingSphere();
    geometry.computeFaceNormals();
    geometry.computeVertexNormals();
    return geometry;
  }
};

module.exports = { HoleCuttingRenderer };
