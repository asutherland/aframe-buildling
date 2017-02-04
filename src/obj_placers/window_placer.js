/**
 * Will probably be made generic soon, but for now the idea is to place as wide
 * a window as possible on each WPSCP and with padding.
 */
function RectangularWindowPlacer(hPadding, vBottom, vTop) {
  this.hPad = hPadding;
  this.vBottom = vBottom;
  this.vTop = vTop;
}
RectangularWindowPlacer.prototype = {
  placeOnSegment: function(seg) {
    var objLength = seg.length - this.hPad * 2;
    var lowStart = new THREE.Vector2(0, this.vBottom);
    var lowEnd = new THREE.Vector2(objLength, this.vBottom);
    var highStart = new THREE.Vector2(0, this.vTop);
    var highEnd = new THREE.Vector2(objLength, this.vTop);

    seg.objects.push({
      start: this.hPad,
      end: seg.length - this.hPad,
      bottomCurve: new THREE.LineCurve(lowStart, lowEnd),
      topCurve: new THREE.LineCurve(highStart, highEnd),
      minPoints: 2,
      maxPoints: 2
    });
  }
}

function RoundWindowPlacer(hPadding, vBottom, vTop) {
  this.hPad = hPadding;
  this.vBottom = vBottom;
  this.vTop = vTop;
}
RoundWindowPlacer.prototype = {
  placeOnSegment: function(seg) {
    var hRadius = (seg.length - this.hPad * 2) / 2;
    var hCenter = hRadius;
    var vRadius = (this.vTop - this.vBottom) / 2
    var vCenter = this.vBottom + vRadius;

    seg.objects.push({
      start: this.hPad,
      end: seg.length - this.hPad,
      bottomCurve: new THREE.EllipseCurve(
        hCenter, vCenter,
        hRadius, vRadius,
        Math.PI, Math.PI * 2,
        false, 0
      ),
      topCurve: new THREE.EllipseCurve(
        hCenter, vCenter,
        hRadius, vRadius,
        Math.PI, 0,
        true, 0
      ),
      minPoints: 16,
      maxPoints: 16
    });
  }
}


module.exports = { WindowPlacer: RoundWindowPlacer };
