/**
 * Camera-bridge custom events. A leaf module so that lightweight consumers
 * (the route's keyboard handler, the command menu) can listen without
 * statically pulling beat-map-3d.tsx — which drags in three.js, R3F, and
 * drei. Keeping these constants here lets Rollup actually code-split the
 * heavy 3D module behind its dynamic import.
 */

/**
 * Route chrome (Esc / Re-center) dispatches this to clear the camera's
 * pan + orbit + zoom offsets without lifting the refs into a store.
 */
export const RESET_CAMERA_EVENT = "sceneos:camera:reset";

/**
 * Minimap → camera bridge. Detail: { beatId } activates that beat
 * (camera arcs into orbit). Same one-shot CustomEvent pattern as RESET;
 * lives at the same level so the minimap stays decoupled from the
 * WebGL tree.
 */
export const GOTO_CAMERA_EVENT = "sceneos:camera:goto";
