var { WindowPlacer } = require('./obj_placers/window_placer');

/**
 * Place objects along the WPSCP's.
 *
 * This is going to be filled out in phases:
 *
 * Phase 1, aka NOW:
 * - Only place windows.  Place them everywhere.  They are the best.
 *
 * Phase 2, soon:
 * - Introduce a face planner that marks where doors go, as dictated by block
 *   list.
 * - Key the object placer based on what the face planner told us to do, like
 *   using the door planner for doors!
 *
 * Phase 3, later:
 * - Create a composite/recursive object placer that knows how to do shape
 *   grammar stuff like split up the segment into multiple parts and then apply
 *   rules.
 * - Establish the up/down face links and help the face planners compute
 *   gradients across the (2d) faces to do things like let window sizes vary in
 *   an artistic fashion.
 */
function placeObjects(space) {
  // put 1ft of space on both sides of the window.  The window wants to be ~3ft
  // off the ground and stop 1ft below the ceiling.
  var placer = new WindowPlacer(space.hUnit / 6,
                                space.vUnit * 3 / 8, space.vUnit * 7 / 8);

  for (var iGroup = 0; iGroup < space.groups2dByY.length; iGroup++) {
    var group2d = space.groups2dByY[iGroup];
    var floorY = group2d.blocks[0].floorY;

    for (var iSeg = 0; iSeg < group2d.segments.length; iSeg++) {
      var seg = group2d.segments[iSeg];

      placer.placeOnSegment(seg);
    }
  }
}

module.exports = { placeObjects };
