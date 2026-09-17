/**
 * Lanceur du backend en mode démonstration.
 * Force NODE_ENV=demo avant tout import applicatif afin que .env.demo soit
 * chargé, puis démarre le serveur Express (jobs planifiés neutralisés).
 */
process.env.NODE_ENV = 'demo';

void import('../../../src/server');
