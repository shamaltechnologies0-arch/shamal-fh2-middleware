export type UserRole = "admin" | "operator" | "viewer";
export interface AssignedProject {
    projectCode: string;
    projectName?: string;
}
export interface ViewerDashboardPermissions {
    fleetOverview?: boolean;
    droneTelemetry?: boolean;
    dockTelemetry?: boolean;
    batteryStatus?: boolean;
    gpsLocation?: boolean;
    onlineOffline?: boolean;
    liveCamera?: boolean;
    droneFpv?: boolean;
    alertsEvents?: boolean;
    missionMediaHistory?: boolean;
    refreshButton?: boolean;
}
export interface ShamalSession {
    apiKey: string;
    role: UserRole;
    displayName: string;
    sessionToken: string;
    username: string;
    viewerDashboardPermissions?: ViewerDashboardPermissions;
    assignedProjects?: AssignedProject[];
    fallbackProjectCode?: string | null;
    selectedProjectCode?: string | null;
}
export declare const SESSION_STORAGE_KEY = "shamalCcSession";
