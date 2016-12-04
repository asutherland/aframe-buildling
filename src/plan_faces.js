var { BasicWallPlanner } = require('./wall_planners/basic_wall');

/**
 * For now we hard-code the use of the only wall-planner we have,
 * BasicWallPlanner.
 */
function planFaces(space) {
  var inset = space.hUnit / 5;
  var wallPlanner = new BasicWallPlanner(inset);

  for (var iGroup = 0; iGroup < space.groups2dByY.length; iGroup++) {
    var group2d = space.groups2dByY[iGroup];

    for (var iFace = 0; iFace < group2d.startVoxFaces.length; iFace++) {
      var startFace = group2d.startVoxFaces[iFace];

      var face = startFace;
      do {
        face.wallPlanner = wallPlanner;

        face = face.nextFace;
      } while (face !== startFace);
    }
  }
}

module.exports = { planFaces };
