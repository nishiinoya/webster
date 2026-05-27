export interface AuthUser {
  id: string;
  auth0Subject: string;
  email: string;
  displayName: string | null;
}
