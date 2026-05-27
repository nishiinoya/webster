export interface AuthUser {
  /** Internal DB UUID */
  id: string;
  /** Auth0 sub claim */
  auth0Subject: string;
  email: string;
  displayName: string | null;
}
