import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppHeader from "@/src/components/layout/AppHeader";
import AuthSessionProvider from "@/src/components/providers/AuthSessionProvider";
import ToastProvider from "@/src/components/providers/ToastProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Simple Project Task Tracker 2.1",
  description:
    "Multi-view project task tracker with Kanban boards and Planner-style task details.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-AU"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
        <AuthSessionProvider>
          <ToastProvider>
            <AppHeader />
            <main className="flex-1">{children}</main>
          </ToastProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
