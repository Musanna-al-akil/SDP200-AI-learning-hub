"use client";
import { Button } from "@/components/shadcn/ui/button";
import { apiClient } from "@/lib/api/client";
import { useEffect, useState } from "react";

export default function Home() {
  const [count, setCount] = useState(0);
  const [health, setHealth] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .getHealth()
      .then(data => setHealth(`${data.service}:${data.status}`))
      .catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : "Failed to load health");
      });
  }, []);
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      {health && <p>{health}</p>}
      {error && <p className="text-red-600">{error}</p>}
      {count}
      <Button onClick={() => setCount(count + 1)}>Click me</Button>
    </div>
  );
}
