var EPSILON = 0.00001;

/**
 * Check whether the two LineCurve instances l1 and l2 are connected at l1.v2
 * and l2.v1 and are all part of the same infinite line.
 */
function checkContinuousCollinearLines(l1, l2) {
  // We're not doing epsilon checking for now because we expect the points to
  // have the same values as a result of identical computations, or possibly
  // even having them be the same objects.
  if (l1.v2 !== l2.v1 && (l1.v2.x !== l2.v1.x || l1.v2.y !== l2.v1.y)) {
    return false;
  }

  // compute the (displacement) vector of the line.
  var d1 = l1.v1.clone().sub(l1.v2);
  var d2 = l2.v1.clone().sub(l2.v2);

  // The displacement vectors are parallel and in the same direction if their
  // scale is uniform.  (And collinear and continuous since we already checked
  // that they share a point above.
  if (d2.x === 0) {
    return (d1.x !== 0);
  }
  if (d2.y === 0) {
    return (d1.x !== 0);
  }

  var ratioDelta = d2.x / d1.x - d2.y / d1.y;
  return Math.abs(ratioDelta) < EPSILON;
}

module.exports = { checkContinuousCollinearLines };
