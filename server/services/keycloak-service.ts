/**
 * Keycloak Integration Service
 * Provides enterprise-grade identity and access management
 */

import axios, { AxiosInstance } from 'axios';

interface KeycloakConfig {
  serverUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
  adminUsername?: string;
  adminPassword?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
  scope: string;
}

interface UserRepresentation {
  id?: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  emailVerified?: boolean;
  attributes?: Record<string, string[]>;
  credentials?: Array<{
    type: string;
    value: string;
    temporary?: boolean;
  }>;
  groups?: string[];
  realmRoles?: string[];
}

interface GroupRepresentation {
  id?: string;
  name: string;
  path?: string;
  subGroups?: GroupRepresentation[];
  attributes?: Record<string, string[]>;
}

export class KeycloakService {
  private config: KeycloakConfig;
  private client: AxiosInstance;
  private adminToken: string | null = null;
  private adminTokenExpiry: number = 0;

  constructor(config: KeycloakConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.serverUrl,
      timeout: 10000,
    });
  }

  // Get admin access token
  private async getAdminToken(): Promise<string> {
    if (this.adminToken && Date.now() < this.adminTokenExpiry) {
      return this.adminToken;
    }

    const tokenUrl = `${this.config.serverUrl}/realms/master/protocol/openid-connect/token`;
    
    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('client_id', 'admin-cli');
    params.append('username', this.config.adminUsername || 'admin');
    params.append('password', this.config.adminPassword || 'admin');

    const response = await this.client.post<TokenResponse>(tokenUrl, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    this.adminToken = response.data.access_token;
    this.adminTokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;

    return this.adminToken;
  }

  // Authenticate user with username/password
  async authenticateUser(username: string, password: string): Promise<TokenResponse> {
    const tokenUrl = `${this.config.serverUrl}/realms/${this.config.realm}/protocol/openid-connect/token`;

    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('client_id', this.config.clientId);
    params.append('client_secret', this.config.clientSecret);
    params.append('username', username);
    params.append('password', password);

    const response = await this.client.post<TokenResponse>(tokenUrl, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return response.data;
  }

  // Refresh access token
  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    const tokenUrl = `${this.config.serverUrl}/realms/${this.config.realm}/protocol/openid-connect/token`;

    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('client_id', this.config.clientId);
    params.append('client_secret', this.config.clientSecret);
    params.append('refresh_token', refreshToken);

    const response = await this.client.post<TokenResponse>(tokenUrl, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return response.data;
  }

  // Validate access token
  async validateToken(accessToken: string): Promise<unknown> {
    const introspectUrl = `${this.config.serverUrl}/realms/${this.config.realm}/protocol/openid-connect/token/introspect`;

    const params = new URLSearchParams();
    params.append('token', accessToken);
    params.append('client_id', this.config.clientId);
    params.append('client_secret', this.config.clientSecret);

    const response = await this.client.post(introspectUrl, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return response.data;
  }

  // Logout user
  async logout(refreshToken: string): Promise<void> {
    const logoutUrl = `${this.config.serverUrl}/realms/${this.config.realm}/protocol/openid-connect/logout`;

    const params = new URLSearchParams();
    params.append('client_id', this.config.clientId);
    params.append('client_secret', this.config.clientSecret);
    params.append('refresh_token', refreshToken);

    await this.client.post(logoutUrl, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  }

  // Create new user
  async createUser(user: UserRepresentation): Promise<string> {
    const token = await this.getAdminToken();
    const usersUrl = `${this.config.serverUrl}/admin/realms/${this.config.realm}/users`;

    const response = await this.client.post(usersUrl, user, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Get user ID from location header
    const location = response.headers.location;
    const userId = location?.split('/').pop() || '';

    return userId;
  }

  // Get user by ID
  async getUser(userId: string): Promise<UserRepresentation> {
    const token = await this.getAdminToken();
    const userUrl = `${this.config.serverUrl}/admin/realms/${this.config.realm}/users/${userId}`;

    const response = await this.client.get<UserRepresentation>(userUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return response.data;
  }

  // Get user by username
  async getUserByUsername(username: string): Promise<UserRepresentation | null> {
    const token = await this.getAdminToken();
    const usersUrl = `${this.config.serverUrl}/admin/realms/${this.config.realm}/users`;

    const response = await this.client.get<UserRepresentation[]>(usersUrl, {
      headers: { Authorization: `Bearer ${token}` },
      params: { username, exact: true },
    });

    return response.data[0] || null;
  }

  // Get user by email
  async getUserByEmail(email: string): Promise<UserRepresentation | null> {
    const token = await this.getAdminToken();
    const usersUrl = `${this.config.serverUrl}/admin/realms/${this.config.realm}/users`;

    const response = await this.client.get<UserRepresentation[]>(usersUrl, {
      headers: { Authorization: `Bearer ${token}` },
      params: { email, exact: true },
    });

    return response.data[0] || null;
  }

  // Update user
  async updateUser(userId: string, user: Partial<UserRepresentation>): Promise<void> {
    const token = await this.getAdminToken();
    const userUrl = `${this.config.serverUrl}/admin/realms/${this.config.realm}/users/${userId}`;

    await this.client.put(userUrl, user, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // Delete user
  async deleteUser(userId: string): Promise<void> {
    const token = await this.getAdminToken();
    const userUrl = `${this.config.serverUrl}/admin/realms/${this.config.realm}/users/${userId}`;

    await this.client.delete(userUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // Reset user password
  async resetPassword(userId: string, password: string, temporary: boolean = false): Promise<void> {
    const token = await this.getAdminToken();
    const passwordUrl = `${this.config.serverUrl}/admin/realms/${this.config.realm}/users/${userId}/reset-password`;

    await this.client.put(passwordUrl, {
      type: 'password',
      value: password,
      temporary,
    }, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // Send verification email
  async sendVerificationEmail(userId: string): Promise<void> {
    const token = await this.getAdminToken();
    const verifyUrl = `${this.config.serverUrl}/admin/realms/${this.config.realm}/users/${userId}/send-verify-email`;

    await this.client.put(verifyUrl, null, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // Get user roles
  async getUserRoles(userId: string): Promise<string[]> {
    const token = await this.getAdminToken();
    const rolesUrl = `${this.config.serverUrl}/admin/realms/${this.config.realm}/users/${userId}/role-mappings/realm`;

    const response = await this.client.get<Array<{ name: string }>>(rolesUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return response.data.map(role => role.name);
  }

  // Assign role to user
  async assignRole(userId: string, roleName: string): Promise<void> {
    const token = await this.getAdminToken();
    
    // Get role by name
    const roleUrl = `${this.config.serverUrl}/admin/realms/${this.config.realm}/roles/${roleName}`;
    const roleResponse = await this.client.get(roleUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Assign role to user
    const assignUrl = `${this.config.serverUrl}/admin/realms/${this.config.realm}/users/${userId}/role-mappings/realm`;
    await this.client.post(assignUrl, [roleResponse.data], {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // Remove role from user
  async removeRole(userId: string, roleName: string): Promise<void> {
    const token = await this.getAdminToken();
    
    // Get role by name
    const roleUrl = `${this.config.serverUrl}/admin/realms/${this.config.realm}/roles/${roleName}`;
    const roleResponse = await this.client.get(roleUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Remove role from user
    const removeUrl = `${this.config.serverUrl}/admin/realms/${this.config.realm}/users/${userId}/role-mappings/realm`;
    await this.client.delete(removeUrl, {
      headers: { Authorization: `Bearer ${token}` },
      data: [roleResponse.data],
    });
  }

  // Get user groups
  async getUserGroups(userId: string): Promise<GroupRepresentation[]> {
    const token = await this.getAdminToken();
    const groupsUrl = `${this.config.serverUrl}/admin/realms/${this.config.realm}/users/${userId}/groups`;

    const response = await this.client.get<GroupRepresentation[]>(groupsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return response.data;
  }

  // Add user to group
  async addUserToGroup(userId: string, groupId: string): Promise<void> {
    const token = await this.getAdminToken();
    const groupUrl = `${this.config.serverUrl}/admin/realms/${this.config.realm}/users/${userId}/groups/${groupId}`;

    await this.client.put(groupUrl, null, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // Remove user from group
  async removeUserFromGroup(userId: string, groupId: string): Promise<void> {
    const token = await this.getAdminToken();
    const groupUrl = `${this.config.serverUrl}/admin/realms/${this.config.realm}/users/${userId}/groups/${groupId}`;

    await this.client.delete(groupUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // Create group
  async createGroup(group: GroupRepresentation): Promise<string> {
    const token = await this.getAdminToken();
    const groupsUrl = `${this.config.serverUrl}/admin/realms/${this.config.realm}/groups`;

    const response = await this.client.post(groupsUrl, group, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const location = response.headers.location;
    return location?.split('/').pop() || '';
  }

  // Get all groups
  async getGroups(): Promise<GroupRepresentation[]> {
    const token = await this.getAdminToken();
    const groupsUrl = `${this.config.serverUrl}/admin/realms/${this.config.realm}/groups`;

    const response = await this.client.get<GroupRepresentation[]>(groupsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return response.data;
  }

  // Create role
  async createRole(roleName: string, description?: string): Promise<void> {
    const token = await this.getAdminToken();
    const rolesUrl = `${this.config.serverUrl}/admin/realms/${this.config.realm}/roles`;

    await this.client.post(rolesUrl, {
      name: roleName,
      description,
    }, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // Get all roles
  async getRoles(): Promise<Array<{ name: string; description?: string }>> {
    const token = await this.getAdminToken();
    const rolesUrl = `${this.config.serverUrl}/admin/realms/${this.config.realm}/roles`;

    const response = await this.client.get(rolesUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return response.data;
  }
}

// Factory function
export function createKeycloakService(config?: Partial<KeycloakConfig>): KeycloakService {
  const defaultConfig: KeycloakConfig = {
    serverUrl: process.env.KEYCLOAK_URL || 'http://localhost:8080',
    realm: process.env.KEYCLOAK_REALM || 'agrifinance',
    clientId: process.env.KEYCLOAK_CLIENT_ID || 'agrifinance-api',
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
    adminUsername: process.env.KEYCLOAK_ADMIN_USERNAME || 'admin',
    adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin',
  };

  return new KeycloakService({ ...defaultConfig, ...config });
}

export default KeycloakService;
