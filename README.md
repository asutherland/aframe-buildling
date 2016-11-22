## Layout ##

We take as input a rough voxel-defined bounding region for the building to be
built in and any voxels where important externally relevant features like doors
should go.

### Space Allocation ###

Buildings are allocated space via the "blocks" property.

The blocks are integer-quantized voxels, with the block at 0 0 0 sitting
on top of the y=0 plane, centered around the +y axis.  These blocks are
notionally 6ft cubes if you're American, or 2m cubes usually thought of
in 1/3 of a meter increments if you're not.  They are units of space
allocation not a geometry alignment grid.

The choice of 6ft is made because:
- It's a large enough value to contain a 3ft wide door.
- Double-height is enough for a 7ft high door, 1ft of clearance, then
 4ft of roof.
- Some other multiples where a house 3 voxels wide can have a reasonable
 buffer on ths sides (2ft each) plus windows with reasonable spacing
 between the door.
- 6ft works for a 2-lane pedestrian path.

For now, buildings have 8ft floors.  For houses with sloped rooves, uninhabited
rooves need at least 4ft of clearance.  Inhabited rooves like with dormers can
do with only 2ft of extra height.

### Building Construction ###

Construction proceeds floor by floor in multiple passes.

#### 1: Floor Slicing ####

In the first pass, floor space is allocated where voxels at the current floor
height exist and have an available voxel above fulfilling the rest of the
vertical space needs.  An 2d block space representation is derived to provide a
marching "squares" type representation where anywhere between 1 and 4 path
segments are desired for each square based on the number of exposed faces.  This
is done for all floors.

#### 2: Face Planning ####

During the second pass, face-planners are provided with all the floor space
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
because it's really 1 "curve" per block space face that the WPSCP touches.  (A
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

#### 6: Floor and Ceiling Hacks ####

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
