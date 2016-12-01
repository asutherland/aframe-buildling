## Layout ##

We take as input a rough voxel-defined bounding region for the building to be
built in and any voxels where important externally relevant features like doors
should go.

### Space Allocation ###

Buildings are allocated space via the "blocks" property.

The blocks are integer-quantized voxels, with the block at 0 0 0 sitting
on top of the y=0 plane, centered around the +y axis.  While configurable, these
blocks are intended to have the same dimensions in both horizontal directions,
about ~6ft, and a vertical height corresponding to a single building floor,
defaulting to 8ft, but 10ft also being possible.  They are units of space
allocation not a geometry alignment grid.

The choice of 6ft horizontally is made because:
- It's a large enough value to contain a 3ft wide door.
- Some other multiples where a house 3 voxels wide can have a reasonable
 buffer on ths sides (2ft each) plus windows with reasonable spacing
 between the door.
- 6ft works for a 2-lane pedestrian path.

Previously, cubic voxels were considered, with 6ft height being used so that
the leftovers could be used for sloping roofs.  However, we're not doing
sloping rooves initially, and the floor-slicing process becomes needlessly
complex in that case.  It's easy enought to just have the top set of blocks
be allocated to roof-space that need not use up the entire vertical allocation.

### Building Construction ###

Construction proceeds floor by floor in multiple passes.

#### 1: Floor Slicing ####

In the first pass, we find groups of blocks connected via North/East/South/West
2d relationships for each "floor" (distinct y value).  Informed by THREE.js'
XZ ground plane where +Z is coming at the camera and +X goes off to the right,
we declare north to be -Z and east to be +X.

For each of these groups we compute a "VoxFace" representation.  VoxFaces are
about responsibility for generating walls; they do not describe actual geometry.

VoxFaces have types: north, northeast corner, east, southeast corner, south,
southwest corner, west, and northwest corner.  A "north" voxface indicates a
responsibility to generate a wall path that is connected to the "west" and
"east" sides of the block somewhere.  Such a wall inherently be north-facing,
which is why we name it a north voxface, but it doesn't need to be a perfectly
flat wall flush with the north boundary of the block or parallel to it.  The
west and east points can be anywhere along the west or east sides of the block.

Similarly, a northeast corner is a responsibility to generate a wall the starts
on the west side of the block and ends on the south side.  We define things this
way so that there is a clear owner responsible for determining how the corner
geometry should work.  If we generated separate north and east voxfaces then
we'd need some way for the separate owners to decide a common point for the
corner, etc.

What about "island" or "peninsula" cases where there are 0 or 1 adjacent blocks
on the current floor?  Oh right, those.  Yeah, they get their own types too:
island, north cape, east cape, south cape, west cape.  Why cape?  It turns out
those are basically peninsulas, but are much easier to type!  So a north cape
is a block only connected to its south (in 2d).

#### 2: VoxFace Planning ####

During the second pass, voxface-planners are provided with all the floor space
slices and can claim and annotate specific faces.  This allows for the creation
of architectural features that span multiple floors or for the application of
building-scale designs and patterns.

#### 3: Wall Planning ###

In the third-pass, for each floor, wall-planners are invoked for each continuous
run of faces.  This could mean that a wall planner will be invoked with an
entirely closed path.  (For cases of courtyards, it could also mean that
planners may be invoked with multiple closed paths.)  The wall-planner is
responsible for generating one or more "wall-planning segment curve pairs".

A "wall-planning segment curve pair" (WPSCP) describes a stretch of wall that
doesn't have a corner in it or other crazy stuff that would make it impossible
to put a window there.  They also describes the crazy bits, but we'll call
those non-plannable segments.  The basic idea is that there are stretches of
wall where you could put a normal flat window anywhere along them.  But you're
not going to put that flat window on a 90 degree corner.  (You can special order
one in real life, and in here it needs special handling too.)  So if we're on
the second floor of a boring rectangular house and our wall-planner is given one
closed curve, we will produce 4 WPSCP's.

The "pair" comes from the planner producing a curve for both the bottom and top
of the wall AKA floor and ceiling.  And "curve" is also somewhat of a misnomer,
because it's really 1 "curve" per cell-space face that the WPSCP touches.  (A
block face may be referenced by multiple WPSCP's; it would not be surprising
for a corner to consist of 2 plannable WPSCP's joined by a 3rd unplannable
WPSCP.)

In addition to the per block face floor and ceiling curves, we also have a
per-block-face point range that expresses the minimum and maximum number of
points that you might want to use to render the geometry.  For simple walls,
this range can be [2, 2], but for curves a broader LoD range might be
appropriate, and for specifying poly-line-type geometries a fixed number of
points is also likely advisable.  We are thus able to render the walls into 3d
space by sampling the floor and ceiling curves with join points at the edges of
the face.

#### 4: Object Placement ####

Now that we have our "wall-planning segment curve pairs" (WPSCP's) and we know
which ones are plannable, we can allow object placers to consider each curve
and place things along them.  They know the total curve length plus any
annotations from face planning and/or wall planning, so they can decide where
doors or windows or air vents or whatever go.  This is where shape grammars
happen if you're into that type of thing.

The result of object placement is a list of [start t, end t] ranges along the
curve where the object placer will want to participate in rendering by engaging
in hole-cutting and/or finding 3d coordinates to place separate geometries.

#### 5: Wall Rendering #####

For each "wall-planning segment curve pair" we walk the underlying per-face
segments and create 3d geometry by sampling the curves along the points they ask
for.  Things get more complex when object placers request hole-cutting in the
wall.  In those cases, we render the wall until we reach a hole-cutting region.
At that point we ask it for two curves (a bottom and a top) and a point count
range.  We walk along these hole-curves in lock-step, rendering from the wall
floor curve to the bottom hole curve, and from the wall ceiling curve to
the top hole curve, plus connecting the ends of the hole curves if they aren't
already closed.

Currently the curves need to be 2d, with the coordinate-space interpreted in the
plane defined by the wall's normal at that (approximate) point.  A simple future
enhancement would be to allow 3d curves to be used, allowing for a limited
number of tricks to be played before getting into more complex computational
geometry issues.

After the holes are cut (or if no hole was cut), the placer will be invoked and
given a function findPlaceOnWallPiece(subT, h) that will provide the 3d
position of the point on the wall segment.  (Where subT is [0, 1] over the
placement range we're covering, and h is [0, 1] over the height of the wall.)

#### 6: Floor and Ceiling Linkage (Hacks) ####

Although sloped rooves are cool, they're also not trivial.  For now we do
the simplest thing which is that we generate floor and ceiling slabs for every
building floor.  The mechanism is similar to wall generation.  For all faces we
generate geometry connecting the ceiling curve to the "enclosed" portions of
the floor/ceiling square.  For every occupied block space that doesn't have any
faces, we generate a trivial square.

## Examples ##

Face planners:
- Default: normal wall!
- Door: Just annotates the door voxel face.
- Chimney.
- Garage?

Wall planners:
- Default: normal wall with setback, 90 degree corners.
- Fancy corners: cut or curved corners or whatever.
