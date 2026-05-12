// Runs before any test module is evaluated, ensuring CHEX_SCHEMA_DIR is set
// before Generator's static property captures it from process.env.
process.env.CHEX_SCHEMA_DIR = new URL('./fixtures', import.meta.url).pathname;