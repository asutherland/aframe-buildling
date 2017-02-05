/**
 * Render the floor curves of all known WPSCPs as 2d lines along the floor.
 * This can be done immediately after the wall planning stage without running
 * object placement, wall rendering, or floor-and-ceiling linkage.
 */
function renderDebugFloorLineMesh(space) {
  var geometry = new THREE.Geometry();

  for (var iGroup = 0; iGroup < space.groups2dByY.length; iGroup++) {
    var group2d = space.groups2dByY[iGroup];
    var floorY = group2d.blocks[0].floorY;

    for (var iSeg = 0; iSeg < group2d.segments.length; iSeg++) {
      var seg = group2d.segments[iSeg];

      for (var iCurve = 0; iCurve < seg.floorCurves.length; iCurve++) {
        var curve = seg.floorCurves[iCurve];
        var minPoints = seg.pointRanges[iCurve*2] + 2;
        var maxPoints = seg.pointRanges[iCurve*2 + 1] + 2;

        var points = curve.getPoints(minPoints);
        for (var iPoint = 0; iPoint < points.length; iPoint++) {
          var point = points[iPoint];
          geometry.vertices.push(
            new THREE.Vector3(point.x, floorY, point.y)
          );
        }
      }
    }
  }

  return geometry;
}

module.exports = { renderDebugFloorLineMesh };
