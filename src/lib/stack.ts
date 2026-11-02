export const CHIP_RISE = 5
// ponytail: the pile stops growing at 10 chips, past that only the count changes. room is reserved for it up front
export const MAX_LAYERS = 9
export const STACK_ROOM = MAX_LAYERS * CHIP_RISE

// the top chip is the real <Chip>, so layers are only the chips under it
export const stackLayers = (count: number) => Math.min(Math.max(count - 1, 0), MAX_LAYERS)

export const stackLift = (count: number) => stackLayers(count) * CHIP_RISE

// keyed to the layer's place from the bottom so a chip stays put when another lands on top
export const layerJitter = (fromBottom: number) => ((fromBottom * 37) % 5) * 0.6 - 1.2

// what's sitting on the table: chips still in the air are counted already but haven't landed
export const landedCount = (count: number, inFlight: number) => Math.max(count - inFlight, 0)
