// Seeded PRNG (mulberry32). Returns a function that yields floats in [0, 1).
// Used for map generation and initial soldier placement, which must be reproducible
// from the seed so both online players build the same map.
export function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Random value in [a, b) from a seeded generator.
export function rangeOf(rng, a, b) { return a + rng() * (b - a); }

export function randomSeed() { return Math.floor(Math.random() * 4294967296) >>> 0; }

// Non-seeded random value in [a, b). Only for things that don't need to be reproducible.
export function rand(a, b) { return a + Math.random() * (b - a); }
