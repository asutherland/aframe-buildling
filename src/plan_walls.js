

/**
 *
 */
function planWalls(space) {
  var wallPlanner = new BasicWallPlanner();

  for (var iGroup = 0; iGroup < space.groups2dByY.length; iGroup++) {
    var group2d = space.groups2dByY[iGroup];

    for (var iFace = 0; iFace < group2d.startVoxFaces.length; iFace++) {
      var startFace = group2d.startVoxFaces[iFace];


      // - Run backwards to find the start of this planner
      // The startFace is potentially arbitrary and may be in the middle of a
      // run.  So we want to run backwards before using the main processing
      // loop below in order to simplify that.
      var curPlanner = startFace.wallPlanner;
      var face = startFace.nextFace;
      do {
        if (face.wallPlanner !== curPlanner) {
          // We found a different planner!  Have the preceding face be our
          // effective startFace.
          startFace = face.prevFace;
          break;
        }

        face = face.nextFace;
      } while (face !== startFace);

      // - Run forwards, grouping faces by planner and planning on change.
      var faceRun = [];
      // still true: curPlanner === startFace.wallPlanner
      do {
        if (face.wallPlanner !== curPlanner) {
          // Invoke the planner
          curPlanner.planRun(faceRun);

          // reset things
          faceRun = [];
          curPlanner = face.wallPlanner;
        }

        faceRun.push(face);

        face = face.nextFace;
      } while (face !== startFace);
      curPlanner.planRun(faceRun);
    }
  }
}
