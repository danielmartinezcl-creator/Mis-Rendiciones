/**
 * Las funciones de onboarding (createOrganization, seedPentaCostCenters,
 * createCostCenter, listOrganizations) fueron movidas a:
 *
 *   scripts/onboarding.ts
 *
 * Estas funciones usan el admin client y están pensadas para ejecución
 * manual (bootstrap de org nueva), no como server actions públicas.
 * No exponer estas funciones en el bundle de producción.
 */
