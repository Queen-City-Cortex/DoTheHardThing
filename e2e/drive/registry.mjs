// The journey registry. `J` starts empty: each group in e2e/journeys/ exports an object of journeys and drive.mjs merges them with Object.assign(J, group), in order.


// ---- journeys ----
// Every journey carries meta, read by scripts/check-maps.mjs without running this file, so keep it a plain literal: `id` is the
// journey's name, `feature` the map in e2e/features that lists it, `proves` the Sub-features ids (of any map) it proves and
// `strings` the src/copy.ts ids it asserts. `journey` only attaches the meta: J[name](s) runs the function as before.
export const journey = (meta, fn) => Object.assign(fn, { meta });
export const J = {
};