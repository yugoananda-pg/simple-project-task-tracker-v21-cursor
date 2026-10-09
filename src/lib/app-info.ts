/** Release metadata shown in the About modal (FR-ADM-02). */
export const APP_NAME = "Simple Project Task Tracker 2.1";
export const APP_RELEASE = "v2.1.4-executive-intel";

export const APP_CREDITS = {
  name: "Yugo Ananda",
  role: "Grand Designer and Chief Solution Architect",
} as const;

export type StackItem = { name: string; version: string };

export type AboutInfo = {
  appName: string;
  release: string;
  credits: { name: string; role: string };
  stack: StackItem[];
  database: {
    connected: boolean;
    latencyMs: number | null;
    serverVersion: string | null;
  };
  checkedAt: string;
};
