An a-frame component where you specify voxel-like blocks for a building to
occupy and it creates a building for you!

The end-game is to augment a-painter so you can create a basic simulation
with people who live in the buildings and go to work and shopping at the other
buildings you create.  This is a piece of that.

See docs/ for the "how".

### Code Style ###

I started by looking at the a-painter code, which is not trying to be cutting
edge ES6.  I'm not sure of the rationale, but I'm assuming there's some
"avoid transpilation" and "avoid hitting not-yet-optimized JIT const/let paths",
so I'm somewhat rolling that way.  Along these lines I'm using Map and
Array.from which are "modern" dependencies, but so is WebVR, so, yeah...

Module-system-wise, I'm not sure what's going on.  Synchronous require() with
global scope pollution?
