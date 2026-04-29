"use client";

import * as React from "react";

import { apiClient, type Classroom } from "@/lib/api/client";

type ClassroomsContextValue = {
  classrooms: Classroom[];
  isLoadingClassrooms: boolean;
  classroomsError: string | null;
  refreshClassrooms: () => Promise<void>;
  setClassrooms: React.Dispatch<React.SetStateAction<Classroom[]>>;
};

const ClassroomsContext = React.createContext<ClassroomsContextValue | undefined>(undefined);

export function ClassroomsProvider({ children }: { children: React.ReactNode }) {
  const [classrooms, setClassrooms] = React.useState<Classroom[]>([]);
  const [isLoadingClassrooms, setIsLoadingClassrooms] = React.useState(true);
  const [classroomsError, setClassroomsError] = React.useState<string | null>(null);

  const refreshClassrooms = React.useCallback(async () => {
    setIsLoadingClassrooms(true);
    setClassroomsError(null);
    try {
      const result = await apiClient.listClassrooms();
      setClassrooms(result.classrooms);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load classrooms.";
      setClassrooms([]);
      setClassroomsError(message);
    } finally {
      setIsLoadingClassrooms(false);
    }
  }, []);

  const value = React.useMemo<ClassroomsContextValue>(
    () => ({
      classrooms,
      isLoadingClassrooms,
      classroomsError,
      refreshClassrooms,
      setClassrooms,
    }),
    [classrooms, isLoadingClassrooms, classroomsError, refreshClassrooms],
  );

  return <ClassroomsContext.Provider value={value}>{children}</ClassroomsContext.Provider>;
}

export function useClassrooms() {
  const context = React.useContext(ClassroomsContext);
  if (!context) {
    throw new Error("useClassrooms must be used within ClassroomsProvider");
  }
  return context;
}
