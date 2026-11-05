// a tenth of the chip, the same proportions as the table's chips
export const CHIP_RISE = 13
// taller than the table's TILT so the count still fits on the face
export const TRACKER_TILT = 0.75
// ponytail: the pile stops growing at 10 chips, past that only the count changes. room is reserved for it up front
export const MAX_LAYERS = 9
export const STACK_ROOM = MAX_LAYERS * CHIP_RISE

// the top chip is the real <Chip>, so layers are only the chips under it
export const stackLayers = (count: number) => Math.min(Math.max(count - 1, 0), MAX_LAYERS)

export const stackLift = (count: number) => stackLayers(count) * CHIP_RISE

// what's sitting on the table: chips still in the air are counted already but haven't landed
export const landedCount = (count: number, inFlight: number) => Math.max(count - inFlight, 0)
