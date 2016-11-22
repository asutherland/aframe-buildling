var coordinates = AFRAME.utils.coordinates;

var coordParser = function (value) {
  return value.split(',').map(coordinates.parse);
};
var coordStringifier = function (data) {
  return data.map(coordinates.stringify).join(',');
};

AFRAME.registerComponent('buildling', {
  schema: {
    color: { default: '#ccc' },
    /**

    blocks: {
      // a small house!
      default: [
        { x: 0, y: 0, z: -1 },
        { x: -1, y: 0, z: -1 },
        { x: 1, y: 0, z: -1 },
        { x: 0, y: 0, z: 0 },
        { x: -1, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: -1, y: 0, z: 1 },
        { x: 1, y: 0, z: 1 },
      ],
      parse: coordParser,
      stringify: coordStringifier,
    },
    doors: {
      default: [
        { x: 0, y: 0, z: 1 },
      ],
      parse: coordParser,
      stringify: coordStringifier,
    },
    hScale: {
      default: 0.1
    },
    vScale: {
      default: 0.2
    }
  },

  update: function () {
    var hUnit = this.data.hSize / 5;
    var vUnit = this.data.vSize / 10;

    var material = new THREE.LineBasicMaterial({
	      color: this.data.color
    });

    var geometry = new THREE.Geometry();
    this.data.path.forEach(function (vec3) {
      geometry.vertices.push(
        new THREE.Vector3(vec3.x, vec3.y, vec3.z)
      );
    });

    this.el.setObject3D('mesh', new THREE.Line(geometry, material));
  },

  remove: function () {
    this.el.removeObject3D('mesh');
  }
});
