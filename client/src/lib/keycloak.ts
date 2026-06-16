import Keycloak from 'keycloak-js';

// Keycloak configuration
const keycloakConfig = {
  url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'farmer-realm',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'farmer-web',
};

// Create Keycloak instance
const keycloak = new Keycloak(keycloakConfig);

console.warn('[Keycloak] Configuration:', keycloakConfig);

export default keycloak;
