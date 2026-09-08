export interface CloudRegion {
  id: string;
  label: string;
}

export interface CloudProvider {
  readonly name: string;
  readonly label: string;

  /** Fetch available regions for this provider */
  getRegions(): Promise<CloudRegion[]>;

  /** Check if credentials are configured */
  hasCredentials(userId: string): Promise<boolean>;
}
