// Moved to `packages/shared/src/rich/` so the API can validate generated card
// text too — a server that cannot tell a valid figure from a hallucinated one
// cannot accept content from a model. Re-exported here so every existing
// import in apps/web keeps working unchanged.
export * from '@whizzo/shared/rich'
