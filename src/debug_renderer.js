/**
 * Render the floor curves of all known WPSCPs as 2d lines along the floor.
 * This can be done immediately after the wall planning stage without running
 * object placement, wall rendering, or floor-and-ceiling linkage.
 *
 * TODO NEXT
 */
function renderDebugFloorLineMesh(space) {
  var geometry = new THREE.Geometry();

  for (var iGroup = 0; iGroup < space.groups2dByY.length; iGroup++) {
    var group2d = space.groups2dByY[iGroup];


    geometry.vertices.push(
      new THREE.Vector3(vec3.x, vec3.y, vec3.z)
    );
  }



}
