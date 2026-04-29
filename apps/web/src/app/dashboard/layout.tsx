import type { ReactNode } from "react";
import { GraduationCapIcon } from "lucide-react";

import { ClassroomsProvider } from "@/components/dashboard/classrooms-context";
import { DashboardActions } from "@/components/dashboard/dashboard-actions";
import { AppSidebar } from "@/components/shadcn/app-sidebar";
import { Separator } from "@/components/shadcn/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/shadcn/ui/sidebar";
import { TooltipProvider } from "@/components/shadcn/ui/tooltip";

type DashboardLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <ClassroomsProvider>
          <AppSidebar />
          <SidebarInset>
            <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
              <div className="flex items-center gap-3">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="h-4" />
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-sky-100 p-1.5 text-sky-700">
                    <GraduationCapIcon className="size-4" />
                  </div>
                  <p className="text-lg font-medium tracking-tight text-foreground">Classroom</p>
                </div>
              </div>
              <DashboardActions variant="header" />
            </header>
            {children}
          </SidebarInset>
        </ClassroomsProvider>
      </SidebarProvider>
    </TooltipProvider>
  );
}
